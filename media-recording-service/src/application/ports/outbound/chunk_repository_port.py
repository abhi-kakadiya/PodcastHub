"""
Chunk Repository Port (Outbound)

Defines the contract for chunk persistence.
"""

from abc import ABC, abstractmethod
from typing import List, Optional
from uuid import UUID

from src.domain.models import Chunk


class ChunkRepositoryPort(ABC):
    """Outbound port for chunk persistence"""

    @abstractmethod
    async def save(self, chunk: Chunk) -> Chunk:
        """Save or update a chunk"""
        pass

    @abstractmethod
    async def find_by_id(self, chunk_id: UUID) -> Optional[Chunk]:
        """Find a chunk by ID"""
        pass

    @abstractmethod
    async def find_by_recording_id(self, recording_id: UUID) -> List[Chunk]:
        """Find all chunks for a recording"""
        pass

    @abstractmethod
    async def find_by_upload_id(self, upload_id: UUID) -> List[Chunk]:
        """Find all chunks for an upload"""
        pass

    @abstractmethod
    async def find_failed_chunks(self, recording_id: UUID) -> List[Chunk]:
        """Find all failed chunks for a recording that can be retried"""
        pass

    @abstractmethod
    async def count_uploaded_chunks(self, recording_id: UUID) -> int:
        """Count successfully uploaded chunks for a recording"""
        pass

    @abstractmethod
    async def delete(self, chunk_id: UUID) -> bool:
        """Delete a chunk"""
        pass
