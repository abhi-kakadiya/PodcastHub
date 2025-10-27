"""
Upload HTTP Routes with MinIO Integration

Handles chunk uploads, progress queries, and manual processing enqueueing.
Backed by PostgreSQL metadata for consistent state across services.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Form, HTTPException, UploadFile, File
from pydantic import BaseModel

from src.adapters.outbound.minio_storage import MinIOStorageAdapter
from src.adapters.inbound.http.websocket_handler import broadcast_to_session
from src.domain.models import RecordingStatus
from src.infrastructure.config.settings import get_settings
from src.infrastructure.messaging.processing_queue import ProcessingCommandPublisher
from src.infrastructure.persistence import get_recording_metadata_store

router = APIRouter(prefix="/api/uploads", tags=["uploads"])
logger = logging.getLogger(__name__)

_minio_client: Optional[MinIOStorageAdapter] = None
_processing_publisher: Optional[ProcessingCommandPublisher] = None
_publisher_lock = asyncio.Lock()


class ChunkUploadResponse(BaseModel):
    chunk_id: str
    recording_id: str
    sequence: int
    size_bytes: int
    checksum: str
    content_type: str
    minio_path: str
    uploaded_at: str


class ProcessingEnqueuedResponse(BaseModel):
    recording_id: str
    track_type: str
    chunk_count: int
    queue: str
    enqueued_at: str


def get_minio_client() -> MinIOStorageAdapter:
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


async def _get_processing_publisher() -> ProcessingCommandPublisher:
    global _processing_publisher
    if _processing_publisher and _processing_publisher._connection:  # type: ignore[attr-defined]
        return _processing_publisher

    async with _publisher_lock:
        if _processing_publisher and _processing_publisher._connection:  # type: ignore[attr-defined]
            return _processing_publisher

        settings = get_settings()
        publisher = ProcessingCommandPublisher(
            rabbitmq_url=settings.rabbitmq_url,
            queue_name=settings.media_processing_queue,
        )
        await publisher.connect()
        _processing_publisher = publisher
        return publisher


async def _broadcast_progress(session_id: str, payload: dict) -> None:
    await broadcast_to_session(session_id, {"type": "recording-progress", **payload})


@router.post("/chunk", response_model=ChunkUploadResponse)
async def upload_chunk(
    recording_id: str = Form(...),
    sequence: int = Form(...),
    checksum: str = Form(...),
    chunk_file: UploadFile = File(...),
):
    metadata_store = get_recording_metadata_store()

    try:
        recording_uuid = UUID(recording_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid recording_id") from exc

    recording = await metadata_store.get_recording_as_domain(recording_uuid)
    if not recording:
        raise HTTPException(
            status_code=404,
            detail=f"Recording {recording_id} not found",
        )
    if recording.status == RecordingStatus.STOPPED:
        raise HTTPException(
            status_code=409,
            detail="Recording already stopped; no further chunks accepted",
        )

    chunk_bytes = await chunk_file.read()
    calculated_checksum = hashlib.sha256(chunk_bytes).hexdigest()
    if calculated_checksum != checksum:
        await metadata_store.increment_checksum_failure(recording_uuid)
        raise HTTPException(
            status_code=400,
            detail=f"Checksum mismatch: expected {checksum}, got {calculated_checksum}",
        )

    minio = get_minio_client()
    content_type = chunk_file.content_type or (
        "audio/webm" if recording.track_type.value == "audio" else "video/webm"
    )

    minio_path = minio.upload_chunk(
        session_id=recording.session_id,
        recording_id=recording_id,
        track_type=recording.track_type.value,
        sequence=sequence,
        chunk_data=chunk_bytes,
        content_type=content_type,
    )

    try:
        chunk_info = await metadata_store.add_chunk(
            recording_uuid,
            sequence=sequence,
            size_bytes=len(chunk_bytes),
            checksum=checksum,
            content_type=content_type,
            minio_path=minio_path,
        )
    except ValueError as exc:
        # Rollback MinIO object to keep storage clean
        try:
            minio.delete_chunk(minio_path)
        except Exception:  # pragma: no cover - cleanup best effort
            logger.warning("Failed to rollback chunk %s after metadata error", minio_path)
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    progress = await metadata_store.get_recording_progress(recording_uuid)
    await _broadcast_progress(recording.session_id, progress)

    return ChunkUploadResponse(
        chunk_id=chunk_info["chunk_id"],
        recording_id=chunk_info["recording_id"],
        sequence=chunk_info["sequence"],
        size_bytes=chunk_info["size_bytes"],
        checksum=chunk_info["checksum"],
        content_type=chunk_info["content_type"],
        minio_path=chunk_info["minio_path"],
        uploaded_at=chunk_info["uploaded_at"],
    )


@router.post(
    "/recording/{recording_id}/enqueue-processing",
    response_model=ProcessingEnqueuedResponse,
)
async def enqueue_recording_processing(recording_id: str):
    metadata_store = get_recording_metadata_store()
    try:
        recording_uuid = UUID(recording_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid recording_id") from exc

    recording = await metadata_store.get_recording_as_domain(recording_uuid)
    if not recording:
        raise HTTPException(
            status_code=404,
            detail=f"Recording {recording_id} not found",
        )

    chunk_objects = await metadata_store.get_chunk_paths(recording_uuid)
    if not chunk_objects:
        raise HTTPException(
            status_code=400,
            detail=f"No chunks uploaded for recording {recording_id}",
        )

    await metadata_store.mark_processing_enqueued(recording_uuid)

    publisher = await _get_processing_publisher()
    payload = {
        "recording_id": recording_id,
        "session_id": recording.session_id,
        "participant_id": recording.participant_id,
        "track_type": recording.track_type.value,
        "chunk_objects": chunk_objects,
        "content_type": "audio/webm" if recording.track_type.value == "audio" else "video/webm",
        "requested_at": datetime.utcnow().isoformat(),
        "attempts": 0,
    }
    await publisher.publish(payload)

    logger.info(
        "Enqueued recording %s (%s) for processing via queue %s",
        recording_id,
        recording.track_type.value,
        publisher.queue_name,
    )

    return ProcessingEnqueuedResponse(
        recording_id=recording_id,
        track_type=recording.track_type.value,
        chunk_count=len(chunk_objects),
        queue=publisher.queue_name,
        enqueued_at=datetime.utcnow().isoformat(),
    )


@router.get("/recording/{recording_id}/progress")
async def get_upload_progress(recording_id: str):
    metadata_store = get_recording_metadata_store()
    try:
        recording_uuid = UUID(recording_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid recording_id") from exc

    try:
        progress = await metadata_store.get_recording_progress(recording_uuid)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    return progress


@router.get("/session/{session_id}/progress")
async def get_session_upload_progress(session_id: str):
    metadata_store = get_recording_metadata_store()
    return await metadata_store.list_session_progress(session_id)


@router.on_event("shutdown")
async def shutdown_processing_publisher():
    global _processing_publisher
    if _processing_publisher:
        await _processing_publisher.close()
        _processing_publisher = None
