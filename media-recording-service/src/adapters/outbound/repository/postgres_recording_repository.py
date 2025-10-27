"""
PostgreSQL Recording Repository

Implements RecordingRepositoryPort using the shared RecordingMetadataStore.
"""

from __future__ import annotations

from typing import List, Optional
from uuid import UUID

from src.application.ports.outbound import RecordingRepositoryPort
from src.domain.models import Recording
from src.infrastructure.persistence import RecordingMetadataStore


class PostgresRecordingRepository(RecordingRepositoryPort):
    """Persistence adapter backed by PostgreSQL via RecordingMetadataStore."""

    def __init__(self, metadata_store: RecordingMetadataStore):
        self._store = metadata_store

    async def save(self, recording: Recording) -> Recording:
        await self._store.save_recording(recording)
        return recording

    async def find_by_id(self, recording_id: UUID) -> Optional[Recording]:
        return await self._store.get_recording_as_domain(recording_id)

    async def find_by_session_id(self, session_id: str) -> List[Recording]:
        return await self._store.list_recordings_as_domain(session_id=session_id)

    async def find_by_participant_id(self, participant_id: str) -> List[Recording]:
        return await self._store.list_recordings_as_domain(participant_id=participant_id)

    async def delete(self, recording_id: UUID) -> bool:
        return await self._store.delete_recording(recording_id)

    async def exists(self, recording_id: UUID) -> bool:
        return await self._store.recording_exists(recording_id)
