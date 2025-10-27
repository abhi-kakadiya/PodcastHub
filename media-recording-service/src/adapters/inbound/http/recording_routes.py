"""
Recording HTTP Routes - Simplified for Frontend
Handles recording operations with multi-track support
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Optional
import uuid
from datetime import datetime

router = APIRouter(prefix="/api/recordings", tags=["recordings"])

# In-memory recording storage (replace with PostgreSQL later)
recordings_db = {}


class StartRecordingRequest(BaseModel):
    session_id: str
    participant_id: str
    track_types: List[str]  # ['audio', 'video', 'screen']


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
    recording_ids: Dict[str, str]  # {audio: uuid, video: uuid, screen: uuid}
    session_id: str
    participant_id: str
    started_at: str


@router.post("/start", response_model=StartRecordingResponse)
async def start_recording(request: StartRecordingRequest):
    """
    Start recording for multiple tracks

    Creates separate recordings for audio, video, and screen tracks.
    Returns recording IDs for each track.
    """
    recording_ids = {}

    for track_type in request.track_types:
        if track_type not in ['audio', 'video', 'screen']:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid track type: {track_type}. Must be one of: audio, video, screen"
            )

        recording_id = str(uuid.uuid4())
        recording_ids[track_type] = recording_id

        # Store recording metadata
        recordings_db[recording_id] = {
            "recording_id": recording_id,
            "session_id": request.session_id,
            "participant_id": request.participant_id,
            "track_type": track_type,
            "status": "recording",
            "started_at": datetime.utcnow().isoformat(),
            "chunks": [],
            "total_chunks": 0,
            "uploaded_chunks": 0,
        }

    return StartRecordingResponse(
        recording_ids=recording_ids,
        session_id=request.session_id,
        participant_id=request.participant_id,
        started_at=datetime.utcnow().isoformat(),
    )


@router.post("/pause")
async def pause_recording(request: PauseRecordingRequest):
    """
    Pause all recordings for a participant in a session
    """
    paused_count = 0

    for recording in recordings_db.values():
        if (recording["session_id"] == request.session_id and
            recording["participant_id"] == request.participant_id and
            recording["status"] == "recording"):
            recording["status"] = "paused"
            recording["paused_at"] = datetime.utcnow().isoformat()
            paused_count += 1

    if paused_count == 0:
        raise HTTPException(
            status_code=404,
            detail="No active recordings found for this session and participant"
        )

    return {
        "message": f"Paused {paused_count} recording(s)",
        "session_id": request.session_id,
        "participant_id": request.participant_id,
    }


@router.post("/resume")
async def resume_recording(request: ResumeRecordingRequest):
    """
    Resume all paused recordings for a participant in a session
    """
    resumed_count = 0

    for recording in recordings_db.values():
        if (recording["session_id"] == request.session_id and
            recording["participant_id"] == request.participant_id and
            recording["status"] == "paused"):
            recording["status"] = "recording"
            recording["resumed_at"] = datetime.utcnow().isoformat()
            resumed_count += 1

    if resumed_count == 0:
        raise HTTPException(
            status_code=404,
            detail="No paused recordings found for this session and participant"
        )

    return {
        "message": f"Resumed {resumed_count} recording(s)",
        "session_id": request.session_id,
        "participant_id": request.participant_id,
    }


@router.post("/stop")
async def stop_recording(request: StopRecordingRequest):
    """
    Stop all recordings for a participant in a session
    """
    stopped_count = 0

    for recording in recordings_db.values():
        if (recording["session_id"] == request.session_id and
            recording["participant_id"] == request.participant_id and
            recording["status"] in ["recording", "paused"]):
            recording["status"] = "stopped"
            recording["ended_at"] = datetime.utcnow().isoformat()
            stopped_count += 1

    if stopped_count == 0:
        raise HTTPException(
            status_code=404,
            detail="No active recordings found for this session and participant"
        )

    return {
        "message": f"Stopped {stopped_count} recording(s)",
        "session_id": request.session_id,
        "participant_id": request.participant_id,
    }


@router.get("/{recording_id}")
async def get_recording(recording_id: str):
    """
    Get recording details by ID
    """
    recording = recordings_db.get(recording_id)

    if not recording:
        raise HTTPException(
            status_code=404,
            detail=f"Recording '{recording_id}' not found"
        )

    return recording


@router.get("/session/{session_id}")
async def get_session_recordings(session_id: str):
    """
    Get all recordings for a session
    """
    session_recordings = [
        rec for rec in recordings_db.values()
        if rec["session_id"] == session_id
    ]

    return {
        "session_id": session_id,
        "total_recordings": len(session_recordings),
        "recordings": session_recordings,
    }
