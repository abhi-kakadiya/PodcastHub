"""
Media Processing Worker

Consumes recording processing commands from RabbitMQ and stitches MinIO chunks
into a single media file using FFmpeg. The stitched file is uploaded back to
MinIO under the `processed/` prefix and a `recording.processed` event is
published to RabbitMQ.
"""

from __future__ import annotations

import asyncio
import json
import logging
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Optional
from uuid import UUID

import aio_pika

from src.adapters.outbound.minio_storage import MinIOStorageAdapter
from src.adapters.outbound.messaging.rabbitmq_publisher import RabbitMQEventPublisher
from src.domain.events.processing_events import RecordingProcessed
from src.infrastructure.config import get_settings

logger = logging.getLogger(__name__)


class MediaProcessingWorker:
    """Background worker responsible for stitching MinIO chunks."""

    def __init__(
        self,
        rabbitmq_url: Optional[str] = None,
        queue_name: Optional[str] = None,
        exchange_name: Optional[str] = None,
    ):
        settings = get_settings()
        self._rabbitmq_url = rabbitmq_url or settings.rabbitmq_url
        self._queue_name = queue_name or settings.media_processing_queue
        self._exchange_name = exchange_name or settings.rabbitmq_exchange
        self._minio = MinIOStorageAdapter(
            endpoint=settings.minio_endpoint,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            secure=settings.minio_secure,
            bucket_name=settings.minio_bucket,
        )
        self._connection: Optional[aio_pika.RobustConnection] = None
        self._channel: Optional[aio_pika.Channel] = None
        self._queue: Optional[aio_pika.Queue] = None
        self._event_publisher = RabbitMQEventPublisher(
            rabbitmq_url=self._rabbitmq_url,
            exchange_name=self._exchange_name,
        )

    async def start(self) -> None:
        """Start consuming processing commands indefinitely."""
        await self._event_publisher.connect()
        self._connection = await aio_pika.connect_robust(self._rabbitmq_url)
        self._channel = await self._connection.channel()
        self._queue = await self._channel.declare_queue(
            self._queue_name,
            durable=True,
        )

        logger.info(
            "MediaProcessingWorker listening on queue '%s' (exchange: %s)",
            self._queue_name,
            self._exchange_name,
        )

        await self._queue.consume(self._handle_message, no_ack=False)
        await asyncio.Future()  # Run forever

    async def _handle_message(self, message: aio_pika.IncomingMessage) -> None:
        """Process a single queue message."""
        async with message.process(requeue=False):
            try:
                payload = json.loads(message.body.decode("utf-8"))
            except json.JSONDecodeError as exc:
                logger.error("Invalid processing payload: %s", exc)
                return

            try:
                await self._process_payload(payload)
            except FileNotFoundError:
                logger.exception("FFmpeg executable not found on worker host")
            except Exception as exc:  # pylint: disable=broad-except
                logger.exception("Failed to process recording payload: %s", exc)

    async def _process_payload(self, payload: Dict[str, Any]) -> None:
        """Download chunks, run FFmpeg concat, upload processed output."""
        recording_id = payload.get("recording_id")
        session_id = payload.get("session_id")
        track_type = payload.get("track_type", "audio")
        chunk_objects = payload.get("chunk_objects") or []
        content_type = payload.get("content_type", "video/webm")
        participant_id = payload.get("participant_id", "")

        if not recording_id or not session_id:
            logger.error("Processing payload missing session_id or recording_id")
            return

        if not chunk_objects:
            chunk_objects = self._minio.list_chunks(session_id, recording_id, track_type)

        chunk_objects = sorted(chunk_objects)
        if not chunk_objects:
            logger.warning("No chunks found for recording %s (%s)", recording_id, track_type)
            return

        logger.info(
            "Processing %s chunks for recording %s (%s)",
            len(chunk_objects),
            recording_id,
            track_type,
        )

        with tempfile.TemporaryDirectory(prefix=f"processing_{recording_id}_") as tmp_dir:
            temp_path = Path(tmp_dir)
            local_chunks = await self._download_chunks(chunk_objects, temp_path)
            if not local_chunks:
                logger.error("Failed to download chunks for recording %s", recording_id)
                return

            manifest_path = temp_path / "chunks.txt"
            manifest_lines = []
            for chunk_path in local_chunks:
                sanitized = chunk_path.as_posix().replace('"', '\\"')
                manifest_lines.append(f'file "{sanitized}"')
            manifest_path.write_text("\n".join(manifest_lines), encoding="utf-8")

            output_path = temp_path / f"{recording_id}.webm"
            await self._run_ffmpeg_concat(manifest_path, output_path)

            if not output_path.exists():
                logger.error("FFmpeg did not produce output for recording %s", recording_id)
                return

            output_bytes = output_path.read_bytes()
            processed_path = self._minio.upload_processed_file(
                session_id=session_id,
                recording_id=recording_id,
                file_data=output_bytes,
                file_name=f"{track_type}_{recording_id}.webm",
                content_type=content_type,
            )

            event = RecordingProcessed(
                recording_id=UUID(recording_id) if self._is_uuid(recording_id) else recording_id,
                session_id=session_id,
                participant_id=participant_id,
                track_type=track_type,
                processed_minio_path=processed_path,
                chunk_count=len(local_chunks),
                size_bytes=len(output_bytes),
            )
            await self._event_publisher.publish(event, routing_key=event.event_type)

            logger.info(
                "Recording %s processed successfully (track=%s, size=%s bytes)",
                recording_id,
                track_type,
                len(output_bytes),
            )

    async def _download_chunks(self, chunk_objects: List[str], temp_path: Path) -> List[Path]:
        """Download chunk objects from MinIO into temp directory."""
        local_paths: List[Path] = []

        for index, object_name in enumerate(chunk_objects):
            target = temp_path / f"chunk_{index:05d}.webm"

            def _download() -> None:
                data = self._minio.get_chunk(object_name)
                target.write_bytes(data)

            await asyncio.to_thread(_download)
            local_paths.append(target)

        return local_paths

    async def _run_ffmpeg_concat(self, manifest_path: Path, output_path: Path) -> None:
        """Run ffmpeg concat demuxer to stitch media chunks."""
        cmd = [
            "ffmpeg",
            "-loglevel",
            "error",
            "-y",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(manifest_path),
            "-c",
            "copy",
            str(output_path),
        ]

        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await process.communicate()

        if process.returncode != 0:
            error_output = (stderr or stdout).decode("utf-8", errors="ignore").strip()
            raise RuntimeError(f"FFmpeg concat failed: {error_output}")

    async def close(self) -> None:
        """Clean up connections."""
        await self._event_publisher.disconnect()
        if self._connection and not self._connection.is_closed:
            await self._connection.close()
            logger.info("MediaProcessingWorker RabbitMQ connection closed")
            self._connection = None
            self._channel = None
            self._queue = None

    @staticmethod
    def _is_uuid(value: Any) -> bool:
        """Return True if value can be parsed as UUID."""
        try:
            UUID(str(value))
        except (ValueError, TypeError):
            return False
        return True
