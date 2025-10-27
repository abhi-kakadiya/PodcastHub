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
from src.domain.events import RecordingFailed
from src.infrastructure.config import get_settings
from src.infrastructure.persistence import RecordingMetadataStore

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
        self._metadata_store = RecordingMetadataStore(settings.database_url)
        self._max_attempts = 3
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
        await self._metadata_store.initialize()
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
        try:
            payload = json.loads(message.body.decode("utf-8"))
        except json.JSONDecodeError as exc:
            logger.error("Invalid processing payload: %s", exc)
            await message.ack()
            return

        attempts = int(payload.get("attempts", 0))

        try:
            await self._process_payload(payload)
        except FileNotFoundError:
            logger.exception("FFmpeg executable not found on worker host")
            await self._handle_processing_exception(payload, attempts, "ffmpeg executable not found")
        except Exception as exc:  # pylint: disable=broad-except
            logger.exception("Failed to process recording payload: %s", exc)
            await self._handle_processing_exception(payload, attempts, str(exc))
        finally:
            await message.ack()

    async def _process_payload(self, payload: Dict[str, Any]) -> None:
        """Download chunks, run FFmpeg concat, upload processed output."""
        recording_id = payload.get("recording_id")
        session_id = payload.get("session_id")
        track_type = payload.get("track_type", "audio")
        chunk_objects = payload.get("chunk_objects") or []
        participant_id = payload.get("participant_id", "")
        rec_uuid: Optional[UUID] = None

        if not recording_id or not session_id:
            logger.error("Processing payload missing session_id or recording_id")
            return

        if self._is_uuid(recording_id):
            rec_uuid = UUID(recording_id)
            await self._metadata_store.mark_processing_started(rec_uuid)

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
                manifest_lines.append(f"file '{chunk_path.as_posix()}'")
            manifest_path.write_text("\n".join(manifest_lines), encoding="utf-8")

            output_extension = "mp3" if track_type == "audio" else "mp4"
            output_path = temp_path / f"{recording_id}.{output_extension}"
            await self._run_ffmpeg_concat(manifest_path, output_path, track_type)

            if not output_path.exists():
                logger.error("FFmpeg did not produce output for recording %s", recording_id)
                return

            output_bytes = output_path.read_bytes()
            processed_content_type = "audio/mpeg" if track_type == "audio" else "video/mp4"
            processed_path = self._minio.upload_processed_file(
                session_id=session_id,
                recording_id=recording_id,
                file_data=output_bytes,
                file_name=f"{track_type}_{recording_id}.{output_extension}",
                content_type=processed_content_type,
            )

            if rec_uuid:
                await self._metadata_store.mark_processing_completed(
                    rec_uuid,
                    processed_path=processed_path,
                    chunk_count=len(local_chunks),
                    size_bytes=len(output_bytes),
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

            for object_name in chunk_objects:
                try:
                    self._minio.delete_chunk(object_name)
                except Exception as exc:  # pragma: no cover - cleanup best effort
                    logger.warning("Failed to delete chunk %s: %s", object_name, exc)
            if rec_uuid:
                await self._metadata_store.delete_chunks(rec_uuid)
                await self._metadata_store.mark_chunks_cleaned(rec_uuid)

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

    async def _run_ffmpeg_concat(self, manifest_path: Path, output_path: Path, track_type: str) -> None:
        """Run ffmpeg concat demuxer to stitch media chunks."""
        cmd = [
            "ffmpeg",
            "-loglevel",
            "error",
            "-fflags",
            "+genpts",
            "-y",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(manifest_path),
        ]
        track = track_type.lower()
        if track == "audio":
            cmd.extend(
                [
                    "-map",
                    "0:a:0",
                    "-c:a",
                    "libmp3lame",
                    "-b:a",
                    "192k",
                    "-ar",
                    "48000",
                ]
            )
        elif track == "screen":
            cmd.extend(
                [
                    "-map",
                    "0:v:0",
                    "-an",
                    "-c:v",
                    "libx264",
                    "-preset",
                    "veryfast",
                    "-crf",
                    "20",
                    "-pix_fmt",
                    "yuv420p",
                    "-movflags",
                    "+faststart",
                ]
            )
        else:
            cmd.extend(
                [
                    "-map",
                    "0:v:0",
                    "-map",
                    "0:a:0",
                    "-c:v",
                    "libx264",
                    "-preset",
                    "veryfast",
                    "-crf",
                    "20",
                    "-pix_fmt",
                    "yuv420p",
                    "-c:a",
                    "aac",
                    "-b:a",
                    "192k",
                    "-movflags",
                    "+faststart",
                ]
            )

        cmd.append(str(output_path))

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
        await self._metadata_store.dispose()

    @staticmethod
    def _is_uuid(value: Any) -> bool:
        """Return True if value can be parsed as UUID."""
        try:
            UUID(str(value))
        except (ValueError, TypeError):
            return False
        return True

    async def _handle_processing_exception(self, payload: Dict[str, Any], attempts: int, reason: str) -> None:
        """Handle processing errors with retry logic and final failure handling."""
        attempts += 1
        recording_id = payload.get("recording_id")
        session_id = payload.get("session_id", "")

        if attempts <= self._max_attempts:
            logger.warning(
                "Retrying processing for recording %s (attempt %s/%s)",
                recording_id,
                attempts,
                self._max_attempts,
            )
            payload["attempts"] = attempts
            await asyncio.sleep(min(2 ** attempts, 30))
            await self._requeue_payload(payload)
            return

        logger.error(
            "Processing failed permanently for recording %s after %s attempts: %s",
            recording_id,
            attempts - 1,
            reason,
        )

        if recording_id and self._is_uuid(recording_id):
            rec_uuid = UUID(recording_id)
            await self._metadata_store.mark_processing_failed(rec_uuid, reason)
            failure_event = RecordingFailed(
                recording_id=rec_uuid,
                session_id=session_id,
                reason=reason,
            )
            await self._event_publisher.publish(failure_event, routing_key=failure_event.event_type)

    async def _requeue_payload(self, payload: Dict[str, Any]) -> None:
        """Requeue payload back onto processing queue."""
        if not self._channel or not self._queue:
            logger.error("Cannot requeue payload: channel or queue not initialised")
            return

        message = aio_pika.Message(
            body=json.dumps(payload).encode("utf-8"),
            content_type="application/json",
        )
        await self._channel.default_exchange.publish(
            message,
            routing_key=self._queue.name,
        )


async def _run_worker() -> None:
    """Helper to run the worker until interruption."""
    worker = MediaProcessingWorker()
    try:
        await worker.start()
    except asyncio.CancelledError:
        logger.info("MediaProcessingWorker cancellation received")
    finally:
        await worker.close()


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )

    try:
        asyncio.run(_run_worker())
    except KeyboardInterrupt:
        logger.info("MediaProcessingWorker interrupted by user")
