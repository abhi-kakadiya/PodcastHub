"""
Session HTTP Routes - Inbound Adapter
Handles session creation and joining
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import uuid
import random
import string
from datetime import datetime

router = APIRouter(prefix="/api/sessions", tags=["sessions"])

# In-memory session storage (replace with PostgreSQL later)
sessions_db = {}


class CreateSessionRequest(BaseModel):
    host_id: str


class JoinSessionRequest(BaseModel):
    room_code: str
    participant_id: str


class SessionResponse(BaseModel):
    session_id: str
    room_code: str
    host_id: str
    status: str
    created_at: str


def generate_room_code() -> str:
    """Generate a unique 6-character room code"""
    while True:
        code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
        # Ensure uniqueness
        if not any(s.get('room_code') == code for s in sessions_db.values()):
            return code


@router.post("/create", response_model=SessionResponse)
async def create_session(request: CreateSessionRequest):
    """
    Create a new session

    Host creates a session and gets a unique room code to share.
    """
    session_id = str(uuid.uuid4())
    room_code = generate_room_code()

    session = {
        "session_id": session_id,
        "room_code": room_code,
        "host_id": request.host_id,
        "status": "active",
        "created_at": datetime.utcnow().isoformat(),
        "participants": [request.host_id],
    }

    sessions_db[session_id] = session

    return SessionResponse(
        session_id=session_id,
        room_code=room_code,
        host_id=request.host_id,
        status="active",
        created_at=session["created_at"],
    )


@router.post("/join", response_model=SessionResponse)
async def join_session(request: JoinSessionRequest):
    """
    Join an existing session using room code

    Guest joins a session by entering the room code.
    """
    # Find session by room code
    session = None
    for s in sessions_db.values():
        if s.get("room_code") == request.room_code.upper():
            session = s
            break

    if not session:
        raise HTTPException(
            status_code=404,
            detail=f"Session with room code '{request.room_code}' not found"
        )

    # Add participant if not already in session
    if request.participant_id not in session["participants"]:
        session["participants"].append(request.participant_id)

    return SessionResponse(
        session_id=session["session_id"],
        room_code=session["room_code"],
        host_id=session["host_id"],
        status=session["status"],
        created_at=session["created_at"],
    )


@router.get("/{session_id}", response_model=SessionResponse)
async def get_session(session_id: str):
    """
    Get session details by ID
    """
    session = sessions_db.get(session_id)

    if not session:
        raise HTTPException(
            status_code=404,
            detail=f"Session '{session_id}' not found"
        )

    return SessionResponse(
        session_id=session["session_id"],
        room_code=session["room_code"],
        host_id=session["host_id"],
        status=session["status"],
        created_at=session["created_at"],
    )


@router.delete("/{session_id}")
async def end_session(session_id: str):
    """
    End a session
    """
    if session_id not in sessions_db:
        raise HTTPException(
            status_code=404,
            detail=f"Session '{session_id}' not found"
        )

    session = sessions_db[session_id]
    session["status"] = "ended"

    return {"message": "Session ended successfully"}
