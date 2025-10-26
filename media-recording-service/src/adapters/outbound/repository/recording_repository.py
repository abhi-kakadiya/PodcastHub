"""
In-Memory Recording Repository

Implements RecordingRepositoryPort using in-memory storage.
This satisfies the requirement of no database for Phase 2.
"""

from typing import Dict, List, Optional
from uuid import UUID
import asyncio

from src.application.ports.outbound import RecordingRepositoryPort
from src.domain.models import Recording


class InMemoryRecordingRepository(RecordingRepositoryPort):
    """
    In-memory implementation of RecordingRepositoryPort.

    Uses a dictionary to store recordings. In production, this would be
    replaced with a database adapter (PostgreSQL, MongoDB, etc.)

    Thread-safety: Uses asyncio locks for concurrent access
    """

    def __init__(self):
        self._recordings: Dict[UUID, Recording] = {}
        self._lock = asyncio.Lock()

    async def save(self, recording: Recording) -> Recording:
        """Save or update a recording"""
        async with self._lock:
            self._recordings[recording.recording_id] = recording
            return recording

    async def find_by_id(self, recording_id: UUID) -> Optional[Recording]:
        """Find a recording by ID"""
        return self._recordings.get(recording_id)

    async def find_by_session_id(self, session_id: str) -> List[Recording]:
        """Find all recordings for a session"""
        return [
            recording
            for recording in self._recordings.values()
            if recording.session_id == session_id
        ]

    async def find_by_participant_id(self, participant_id: str) -> List[Recording]:
        """Find all recordings by a participant"""
        return [
            recording
            for recording in self._recordings.values()
            if recording.participant_id == participant_id
        ]

    async def delete(self, recording_id: UUID) -> bool:
        """Delete a recording"""
        async with self._lock:
            if recording_id in self._recordings:
                del self._recordings[recording_id]
                return True
            return False

    async def exists(self, recording_id: UUID) -> bool:
        """Check if a recording exists"""
        return recording_id in self._recordings

    # Additional helper methods for testing
    async def clear_all(self) -> None:
        """Clear all recordings (useful for testing)"""
        async with self._lock:
            self._recordings.clear()

    async def count(self) -> int:
        """Get total number of recordings"""
        return len(self._recordings)
