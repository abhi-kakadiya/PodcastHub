"""
Simplified Recording HTTP Routes

These endpoints are designed for the prototype frontend while delegating
business rules to the application services and persisting metadata in PostgreSQL.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from typing import Dict, List
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from src.domain.exceptions import InvalidRecordingStateException, RecordingNotFoundException
from src.domain.models import RecordingStatus
from src.infrastructure.dependencies import get_recording_service, get_recording_metadata_store
from src.infrastructure.messaging.processing_queue import ProcessingCommandPublisher
from src.infrastructure.persistence.recording_store import serialize_recording
from src.adapters.inbound.http.websocket_handler import broadcast_to_session

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/recordings", tags=["recordings"])

ALLOWED_TRACKS = {"audio", "video", "screen"}

_processing_publisher: ProcessingCommandPublisher | None = None
_publisher_lock = asyncio.Lock()


class StartRecordingRequest(BaseModel):
    session_id: str
    participant_id: str
    track_types: List[str]


class StopRecordingRequest(BaseModel):
    session_id: str
    participant_id: str


class PauseRecordingRequest(BaseModel):
    session_id: str
    participant_id: str


class ResumeRecordingRequest(BaseModel):
    session_id: str
    participant_id: str


class StartRecordingResponse(BaseModel):
    recording_ids: Dict[str, str]
    session_id: str
    participant_id: str
    started_at: str


async def _get_processing_publisher() -> ProcessingCommandPublisher:
    """Lazy-load ProcessingCommandPublisher singleton."""
    global _processing_publisher
    if _processing_publisher and _processing_publisher._connection:  # type: ignore[attr-defined]
        return _processing_publisher

    async with _publisher_lock:
        if _processing_publisher and _processing_publisher._connection:  # type: ignore[attr-defined]
            return _processing_publisher

        from src.infrastructure.config import get_settings

        cfg = get_settings()
        publisher = ProcessingCommandPublisher(
            rabbitmq_url=cfg.rabbitmq_url,
            queue_name=cfg.media_processing_queue,
        )
        await publisher.connect()
        _processing_publisher = publisher
        return publisher


async def _broadcast_status(session_id: str, payload: dict) -> None:
    """Broadcast recording status updates to all participants."""
    await broadcast_to_session(
        session_id,
        {
            "type": "recording-status",
            **payload,
        },
    )


async def _broadcast_progress(session_id: str, payload: dict) -> None:
    """Broadcast recording progress updates to all participants."""
    await broadcast_to_session(
        session_id,
        {
            "type": "recording-progress",
            **payload,
        },
    )


@router.post("/start", response_model=StartRecordingResponse)
async def start_recording(request: StartRecordingRequest):
    recording_service = get_recording_service()
    metadata_store = get_recording_metadata_store()

    started_at = datetime.utcnow()
    recording_ids: Dict[str, str] = {}

    for track in request.track_types:
        track_lower = track.lower()
        if track_lower not in ALLOWED_TRACKS:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid track type: {track}. Must be one of: audio, video, screen",
            )

        try:
            recording = await recording_service.start_recording(
                session_id=request.session_id,
                participant_id=request.participant_id,
                track_type=track_lower,
            )
        except InvalidRecordingStateException as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc

        await metadata_store.save_recording(recording)
        recording_ids[track_lower] = str(recording.recording_id)

        await _broadcast_status(
            request.session_id,
            {
                "sessionId": request.session_id,
                "participantId": request.participant_id,
                "trackType": recording.track_type.value,
                "recordingId": str(recording.recording_id),
                "status": recording.status.value,
                "startedAt": recording.started_at.isoformat() if recording.started_at else None,
            },
        )

    return StartRecordingResponse(
        recording_ids=recording_ids,
        session_id=request.session_id,
        participant_id=request.participant_id,
        started_at=started_at.isoformat(),
    )


@router.post("/pause")
async def pause_recording(request: PauseRecordingRequest):
    recording_service = get_recording_service()
    metadata_store = get_recording_metadata_store()

    recordings = await metadata_store.list_recordings_as_domain(
        session_id=request.session_id,
        participant_id=request.participant_id,
    )
    active = [rec for rec in recordings if rec.status == RecordingStatus.RECORDING]
    if not active:
        raise HTTPException(
            status_code=404,
            detail="No active recordings found for this session and participant",
        )

    paused = 0
    for recording in active:
        updated = await recording_service.pause_recording(recording.recording_id)
        await metadata_store.save_recording(updated)
        paused += 1

        await _broadcast_status(
            request.session_id,
            {
                "sessionId": request.session_id,
                "participantId": request.participant_id,
                "trackType": updated.track_type.value,
                "recordingId": str(updated.recording_id),
                "status": updated.status.value,
                "pausedAt": updated.paused_at.isoformat() if updated.paused_at else None,
                "pauseCount": updated.pause_count,
            },
        )

    return {
        "message": f"Paused {paused} recording(s)",
        "session_id": request.session_id,
        "participant_id": request.participant_id,
    }


@router.post("/resume")
async def resume_recording(request: ResumeRecordingRequest):
    recording_service = get_recording_service()
    metadata_store = get_recording_metadata_store()

    recordings = await metadata_store.list_recordings_as_domain(
        session_id=request.session_id,
        participant_id=request.participant_id,
    )
    paused = [rec for rec in recordings if rec.status == RecordingStatus.PAUSED]
    if not paused:
        raise HTTPException(
            status_code=404,
            detail="No paused recordings found for this session and participant",
        )

    resumed = 0
    for recording in paused:
        updated = await recording_service.resume_recording(recording.recording_id)
        await metadata_store.save_recording(updated)
        resumed += 1

        await _broadcast_status(
            request.session_id,
            {
                "sessionId": request.session_id,
                "participantId": request.participant_id,
                "trackType": updated.track_type.value,
                "recordingId": str(updated.recording_id),
                "status": updated.status.value,
                "resumedAt": updated.resumed_at.isoformat() if updated.resumed_at else None,
            },
        )

    return {
        "message": f"Resumed {resumed} recording(s)",
        "session_id": request.session_id,
        "participant_id": request.participant_id,
    }


@router.post("/stop")
async def stop_recording(request: StopRecordingRequest):
    recording_service = get_recording_service()
    metadata_store = get_recording_metadata_store()

    recordings = await metadata_store.list_recordings_as_domain(
        session_id=request.session_id,
        participant_id=request.participant_id,
    )
    active = [
        rec for rec in recordings
        if rec.status in {RecordingStatus.RECORDING, RecordingStatus.PAUSED}
    ]
    if not active:
        raise HTTPException(
            status_code=404,
            detail="No active recordings found for this session and participant",
        )

    stopped_ids: List[str] = []
    processing_payloads: List[dict] = []
    for recording in active:
        try:
            updated = await recording_service.stop_recording(recording.recording_id)
        except (InvalidRecordingStateException, RecordingNotFoundException) as exc:
            logger.warning("Failed to stop recording %s: %s", recording.recording_id, exc)
            continue

        await metadata_store.save_recording(updated)
        stopped_ids.append(str(updated.recording_id))

        progress = await metadata_store.get_recording_progress(updated.recording_id)
        await _broadcast_status(
            request.session_id,
            {
                "sessionId": request.session_id,
                "participantId": request.participant_id,
                "trackType": updated.track_type.value,
                "recordingId": str(updated.recording_id),
                "status": updated.status.value,
                "endedAt": updated.ended_at.isoformat() if updated.ended_at else None,
            },
        )
        await _broadcast_progress(request.session_id, progress)

        chunk_paths = await metadata_store.get_chunk_paths(updated.recording_id)
        if not chunk_paths:
            logger.warning("No chunks available for recording %s; skipping processing enqueue", updated.recording_id)
            continue

        await metadata_store.mark_processing_enqueued(updated.recording_id)

        processing_payloads.append(
            {
                "recording_id": str(updated.recording_id),
                "session_id": updated.session_id,
                "participant_id": updated.participant_id,
                "track_type": updated.track_type.value,
                "chunk_objects": chunk_paths,
                "content_type": "audio/webm" if updated.track_type.value == "audio" else "video/webm",
                "requested_at": datetime.utcnow().isoformat(),
                "attempts": 0,
            }
        )

    if not stopped_ids:
        raise HTTPException(
            status_code=500,
            detail="Failed to stop recordings",
        )

    if processing_payloads:
        publisher = await _get_processing_publisher()
        for payload in processing_payloads:
            await publisher.publish(payload)

    return {
        "message": f"Stopped {len(stopped_ids)} recording(s)",
        "session_id": request.session_id,
        "participant_id": request.participant_id,
        "recording_ids": stopped_ids,
        "processing_enqueued": [payload["recording_id"] for payload in processing_payloads],
    }


@router.get("/{recording_id}")
async def get_recording(recording_id: str):
    metadata_store = get_recording_metadata_store()
    try:
        rec_uuid = UUID(recording_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid recording_id") from exc

    recording = await metadata_store.get_recording_as_domain(rec_uuid)
    if not recording:
        raise HTTPException(
            status_code=404,
            detail=f"Recording '{recording_id}' not found",
        )

    progress = await metadata_store.get_recording_progress(rec_uuid)
    payload = serialize_recording(recording)
    payload["progress"] = progress
    return payload


@router.get("/session/{session_id}")
async def get_session_recordings(session_id: str):
    metadata_store = get_recording_metadata_store()
    recordings = await metadata_store.list_recordings_as_domain(session_id=session_id)
    return {
        "session_id": session_id,
        "total_recordings": len(recordings),
        "recordings": [serialize_recording(rec) for rec in recordings],
        "progress_summary": await metadata_store.list_session_progress(session_id),
    }


@router.on_event("shutdown")
async def shutdown_processing_publisher() -> None:
    """Ensure processing publisher connection is closed."""
    global _processing_publisher
    if _processing_publisher:
        await _processing_publisher.close()
        _processing_publisher = None
