"""
Recording Repository Port (Outbound)

Defines the contract for recording persistence.
"""

from abc import ABC, abstractmethod
from typing import List, Optional
from uuid import UUID

from src.domain.models import Recording


class RecordingRepositoryPort(ABC):
    """
    Outbound port for recording persistence.

    This interface is implemented by the repository adapter,
    which can use different storage mechanisms (in-memory, database, etc.)
    """

    @abstractmethod
    async def save(self, recording: Recording) -> Recording:
        """Save or update a recording"""
        pass

    @abstractmethod
    async def find_by_id(self, recording_id: UUID) -> Optional[Recording]:
        """Find a recording by ID"""
        pass

    @abstractmethod
    async def find_by_session_id(self, session_id: str) -> List[Recording]:
        """Find all recordings for a session"""
        pass

    @abstractmethod
    async def find_by_participant_id(self, participant_id: str) -> List[Recording]:
        """Find all recordings by a participant"""
        pass

    @abstractmethod
    async def delete(self, recording_id: UUID) -> bool:
        """Delete a recording"""
        pass

    @abstractmethod
    async def exists(self, recording_id: UUID) -> bool:
        """Check if a recording exists"""
        pass
