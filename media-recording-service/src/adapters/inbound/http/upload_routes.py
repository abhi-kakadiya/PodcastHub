"""
Upload HTTP Routes - Simplified with MinIO Integration
Handles chunk uploads directly to MinIO storage.
"""

from datetime import datetime
import asyncio
import hashlib
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, File, UploadFile, Form
from pydantic import BaseModel

from src.adapters.outbound.minio_storage import MinIOStorageAdapter
from src.infrastructure.config.settings import get_settings
from src.infrastructure.messaging.processing_queue import ProcessingCommandPublisher

router = APIRouter(prefix="/api/uploads", tags=["uploads"])
logger = logging.getLogger(__name__)

# Global MinIO client (lazy init)
_minio_client: Optional[MinIOStorageAdapter] = None

# Processing command publisher (lazy init)
_processing_publisher: Optional[ProcessingCommandPublisher] = None
_publisher_lock = asyncio.Lock()

# Import recordings database from recording_routes
from .recording_routes import recordings_db  # noqa: E402  (circular safe)


def get_minio_client() -> MinIOStorageAdapter:
    """Get or create MinIO client."""
    global _minio_client
    if _minio_client is None:
        settings = get_settings()
        _minio_client = MinIOStorageAdapter(
            endpoint=settings.minio_endpoint,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            secure=settings.minio_secure,
            bucket_name=settings.minio_bucket,
        )
    return _minio_client


async def get_processing_publisher() -> ProcessingCommandPublisher:
    """Get or create processing queue publisher."""
    global _processing_publisher
    async with _publisher_lock:
        if _processing_publisher is None:
            settings = get_settings()
            publisher = ProcessingCommandPublisher(
                rabbitmq_url=settings.rabbitmq_url,
                queue_name=settings.media_processing_queue,
            )
            await publisher.connect()
            _processing_publisher = publisher
    return _processing_publisher


class ChunkUploadResponse(BaseModel):
    chunk_id: str
    recording_id: str
    sequence: int
    size_bytes: int
    checksum: str
    minio_path: str
    uploaded_at: str


class ProcessingEnqueuedResponse(BaseModel):
    recording_id: str
    track_type: str
    chunk_count: int
    queue: str
    enqueued_at: str


@router.post("/chunk", response_model=ChunkUploadResponse)
async def upload_chunk(
    recording_id: str = Form(...),
    sequence: int = Form(...),
    checksum: str = Form(...),
    chunk_file: UploadFile = File(...),
):
    """
    Upload a recording chunk to MinIO.

    This endpoint is used by the browser recorder to stream chunks directly to MinIO.
    """
    try:
        chunk_data = await chunk_file.read()

        calculated_checksum = hashlib.sha256(chunk_data).hexdigest()
        if calculated_checksum != checksum:
            raise HTTPException(
                status_code=400,
                detail=f"Checksum mismatch: expected {checksum}, got {calculated_checksum}",
            )

        recording = recordings_db.get(recording_id)
        if not recording:
            raise HTTPException(
                status_code=404,
                detail=f"Recording {recording_id} not found",
            )

        minio_client = get_minio_client()

        minio_path = minio_client.upload_chunk(
            session_id=recording["session_id"],
            recording_id=recording_id,
            track_type=recording["track_type"],
            sequence=sequence,
            chunk_data=chunk_data,
            content_type=chunk_file.content_type or "video/webm",
        )

        chunk_info = {
            "sequence": sequence,
            "size_bytes": len(chunk_data),
            "checksum": checksum,
            "minio_path": minio_path,
            "uploaded_at": datetime.utcnow().isoformat(),
        }

        recording["chunks"].append(chunk_info)
        recording["total_chunks"] = len(recording["chunks"])
        recording["uploaded_chunks"] = len(recording["chunks"])

        logger.info(
            "Uploaded chunk %s for recording %s (%s bytes) to %s",
            sequence,
            recording_id,
            len(chunk_data),
            minio_path,
        )

        return ChunkUploadResponse(
            chunk_id=f"{recording_id}-{sequence}",
            recording_id=recording_id,
            sequence=sequence,
            size_bytes=len(chunk_data),
            checksum=checksum,
            minio_path=minio_path,
            uploaded_at=chunk_info["uploaded_at"],
        )

    except HTTPException:
        raise
    except Exception as exc:
        logger.error(
            "Error uploading chunk %s for recording %s: %s",
            sequence,
            recording_id,
            exc,
        )
        raise HTTPException(
            status_code=500,
            detail=f"Failed to upload chunk: {exc}",
        ) from exc


@router.post(
    "/recording/{recording_id}/enqueue-processing",
    response_model=ProcessingEnqueuedResponse,
)
async def enqueue_recording_processing(recording_id: str):
    """
    Enqueue a recording for background media processing.

    This sends a message to the processing queue so a dedicated worker service
    can stitch the uploaded chunks using FFmpeg.
    """
    recording = recordings_db.get(recording_id)
    if not recording:
        raise HTTPException(
            status_code=404,
            detail=f"Recording {recording_id} not found",
        )

    if not recording.get("chunks"):
        raise HTTPException(
            status_code=400,
            detail=f"No chunks uploaded for recording {recording_id}",
        )

    sorted_chunks = sorted(recording["chunks"], key=lambda chunk: chunk["sequence"])
    chunk_objects = [chunk["minio_path"] for chunk in sorted_chunks]

    publisher = await get_processing_publisher()
    payload = {
        "recording_id": recording_id,
        "session_id": recording["session_id"],
        "participant_id": recording["participant_id"],
        "track_type": recording["track_type"],
        "chunk_objects": chunk_objects,
        "content_type": "audio/webm" if recording["track_type"] == "audio" else "video/webm",
        "requested_at": datetime.utcnow().isoformat(),
    }
    await publisher.publish(payload)

    logger.info(
        "Enqueued recording %s (%s) for processing via queue %s",
        recording_id,
        recording["track_type"],
        publisher.queue_name,
    )

    return ProcessingEnqueuedResponse(
        recording_id=recording_id,
        track_type=recording["track_type"],
        chunk_count=len(chunk_objects),
        queue=publisher.queue_name,
        enqueued_at=datetime.utcnow().isoformat(),
    )


@router.get("/recording/{recording_id}/progress")
async def get_upload_progress(recording_id: str):
    """
    Get upload progress for a recording.
    """
    recording = recordings_db.get(recording_id)

    if not recording:
        raise HTTPException(
            status_code=404,
            detail=f"Recording {recording_id} not found",
        )

    total_chunks = recording.get("total_chunks", 0)
    uploaded_chunks = recording.get("uploaded_chunks", 0)
    progress = (uploaded_chunks / total_chunks * 100) if total_chunks > 0 else 0

    return {
        "recording_id": recording_id,
        "track_type": recording["track_type"],
        "total_chunks": total_chunks,
        "uploaded_chunks": uploaded_chunks,
        "progress_percentage": progress,
        "status": recording["status"],
        "chunks": recording.get("chunks", []),
    }


@router.get("/session/{session_id}/progress")
async def get_session_upload_progress(session_id: str):
    """
    Get upload progress for all recordings in a session.
    """
    session_recordings = [
        rec for rec in recordings_db.values()
        if rec["session_id"] == session_id
    ]

    if not session_recordings:
        return {
            "session_id": session_id,
            "tracks": {
                "audio": {"uploaded": 0, "total": 0},
                "video": {"uploaded": 0, "total": 0},
                "screen": {"uploaded": 0, "total": 0},
            },
        }

    tracks = {"audio": {}, "video": {}, "screen": {}}

    for rec in session_recordings:
        track_type = rec["track_type"]
        if track_type in tracks:
            total = rec.get("total_chunks", 0)
            uploaded = rec.get("uploaded_chunks", 0)
            progress = (uploaded / total * 100) if total > 0 else 0
            tracks[track_type] = {
                "uploaded": uploaded,
                "total": total,
                "progress": progress,
            }

    return {
        "session_id": session_id,
        "tracks": tracks,
    }


@router.on_event("shutdown")
async def shutdown_processing_publisher():
    """Ensure RabbitMQ connection is closed on application shutdown."""
    global _processing_publisher
    if _processing_publisher:
        await _processing_publisher.close()
        _processing_publisher = None
