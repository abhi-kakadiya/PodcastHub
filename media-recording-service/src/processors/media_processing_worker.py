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
        self._shutdown_event = asyncio.Event()
        self._active_tasks: set = set()
        self._ffmpeg_processes: set = set()

    async def start(self) -> None:
        """Start consuming processing commands indefinitely."""
        await self._event_publisher.connect()
        await self._metadata_store.initialize()
        self._connection = await aio_pika.connect_robust(self._rabbitmq_url)
        self._channel = await self._connection.channel()
        await self._channel.set_qos(prefetch_count=2)  # Limit concurrent processing
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
        
        # Wait for shutdown signal
        await self._shutdown_event.wait()
        
        # Wait for active tasks to complete
        if self._active_tasks:
            logger.info("Waiting for %d active tasks to complete...", len(self._active_tasks))
            await asyncio.gather(*self._active_tasks, return_exceptions=True)

    async def _handle_message(self, message: aio_pika.IncomingMessage) -> None:
        """Process a single queue message."""
        if self._shutdown_event.is_set():
            await message.reject(requeue=True)
            return
            
        task = asyncio.create_task(self._process_message(message))
        self._active_tasks.add(task)
        task.add_done_callback(self._active_tasks.discard)

    async def _process_message(self, message: aio_pika.IncomingMessage) -> None:
        """Process a single message with proper error handling."""
        try:
            payload = json.loads(message.body.decode("utf-8"))
        except json.JSONDecodeError as exc:
            logger.error("Invalid processing payload: %s", exc)
            await self._safe_ack(message)
            return

        attempts = int(payload.get("attempts", 0))

        try:
            await self._process_payload(payload)
            await self._safe_ack(message)
        except asyncio.CancelledError:
            logger.warning("Processing cancelled for recording %s, requeueing", payload.get("recording_id"))
            await self._safe_reject(message, requeue=True)
            raise
        except FileNotFoundError:
            logger.exception("FFmpeg executable not found on worker host")
            await self._handle_processing_exception(payload, attempts, "ffmpeg executable not found")
            await self._safe_ack(message)
        except Exception as exc:  # pylint: disable=broad-except
            logger.exception("Failed to process recording payload: %s", exc)
            await self._handle_processing_exception(payload, attempts, str(exc))
            await self._safe_ack(message)

    async def _safe_ack(self, message: aio_pika.IncomingMessage) -> None:
        """Safely acknowledge a message, ignoring channel errors."""
        try:
            if not message.channel.is_closed:
                await message.ack()
        except Exception as exc:
            logger.debug("Failed to ack message (channel likely closed): %s", exc)

    async def _safe_reject(self, message: aio_pika.IncomingMessage, requeue: bool = True) -> None:
        """Safely reject a message, ignoring channel errors."""
        try:
            if not message.channel.is_closed:
                await message.reject(requeue=requeue)
        except Exception as exc:
            logger.debug("Failed to reject message (channel likely closed): %s", exc)

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

            combined_path = temp_path / f"{recording_id}_combined.webm"
            with combined_path.open("wb") as combined_file:
                for chunk_path in local_chunks:
                    combined_file.write(chunk_path.read_bytes())

            if track_type == "audio":
                output_path = temp_path / f"{recording_id}.mp3"
                await self._run_ffmpeg(
                    [
                        "ffmpeg",
                        "-loglevel",
                        "error",
                        "-y",
                        "-i",
                        str(combined_path),
                        "-c:a",
                        "libmp3lame",
                        "-b:a",
                        "192k",
                        "-ar",
                        "48000",
                        str(output_path),
                    ]
                )
                processed_content_type = "audio/mpeg"
                output_filename = f"{track_type}_{recording_id}.mp3"
            else:
                output_path = temp_path / f"{recording_id}.mp4"
                await self._run_ffmpeg(
                    [
                        "ffmpeg",
                        "-loglevel",
                        "error",
                        "-y",
                        "-i",
                        str(combined_path),
                        "-c:v",
                        "libx264",
                        "-preset",
                        "ultrafast",
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
                        str(output_path),
                    ]
                )
                processed_content_type = "video/mp4"
                output_filename = f"{track_type}_{recording_id}.mp4"

            if not output_path.exists():
                logger.error("FFmpeg did not produce output for recording %s", recording_id)
                return

            output_bytes = output_path.read_bytes()
            processed_path = self._minio.upload_processed_file(
                session_id=session_id,
                recording_id=recording_id,
                file_data=output_bytes,
                file_name=output_filename,
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

    async def _run_ffmpeg(self, cmd: List[str]) -> None:
        """Execute an ffmpeg command and raise on failure."""
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        
        self._ffmpeg_processes.add(process)
        try:
            stdout, stderr = await process.communicate()
        except asyncio.CancelledError:
            # Gracefully terminate FFmpeg on cancellation
            logger.info("FFmpeg process interrupted, terminating...")
            try:
                process.terminate()
                await asyncio.wait_for(process.wait(), timeout=5.0)
            except asyncio.TimeoutError:
                process.kill()
                await process.wait()
            raise
        finally:
            self._ffmpeg_processes.discard(process)
            
        if process.returncode != 0:
            error_output = (stderr or stdout).decode("utf-8", errors="ignore").strip()
            raise RuntimeError(f"FFmpeg command failed: {error_output}")

    async def shutdown(self) -> None:
        """Initiate graceful shutdown."""
        logger.info("Initiating graceful shutdown...")
        self._shutdown_event.set()
        
        # Stop consuming new messages
        if self._queue:
            try:
                await self._queue.cancel(self._queue.consumer_tags[0])
            except Exception as exc:
                logger.debug("Error cancelling queue consumer: %s", exc)

    async def close(self) -> None:
        """Clean up connections."""
        # Terminate any remaining FFmpeg processes
        for process in list(self._ffmpeg_processes):
            try:
                process.terminate()
            except Exception:
                pass
                
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
        if not self._channel or not self._queue or self._channel.is_closed:
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
    
    loop = asyncio.get_running_loop()
    
    def handle_signal():
        logger.info("Received shutdown signal")
        asyncio.create_task(worker.shutdown())
    
    # Register signal handlers
    import signal
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, handle_signal)
    
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