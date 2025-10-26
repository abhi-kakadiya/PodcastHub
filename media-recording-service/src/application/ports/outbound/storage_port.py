"""
Storage Port (Outbound)

Defines the contract for file storage operations.
"""

from abc import ABC, abstractmethod
from typing import Optional
from uuid import UUID


class StoragePort(ABC):
    """
    Outbound port for file storage.

    This interface can be implemented by various storage adapters
    (S3, local filesystem, in-memory, etc.)
    """

    @abstractmethod
    async def store_chunk(
        self,
        chunk_id: UUID,
        recording_id: UUID,
        data: bytes,
        metadata: dict = None,
    ) -> str:
        """
        Store a chunk of data.

        Args:
            chunk_id: Unique identifier for the chunk
            recording_id: ID of the recording this chunk belongs to
            data: The chunk data
            metadata: Optional metadata

        Returns:
            str: Storage path/key where the chunk is stored
        """
        pass

    @abstractmethod
    async def retrieve_chunk(self, chunk_id: UUID) -> Optional[bytes]:
        """
        Retrieve a chunk by ID.

        Args:
            chunk_id: ID of the chunk to retrieve

        Returns:
            bytes: The chunk data or None if not found
        """
        pass

    @abstractmethod
    async def delete_chunk(self, chunk_id: UUID) -> bool:
        """
        Delete a chunk.

        Args:
            chunk_id: ID of the chunk to delete

        Returns:
            bool: True if deleted, False if not found
        """
        pass

    @abstractmethod
    async def get_storage_path(self, recording_id: UUID) -> str:
        """
        Get the storage path for a recording.

        Args:
            recording_id: ID of the recording

        Returns:
            str: Storage path
        """
        pass

    @abstractmethod
    async def cleanup_recording(self, recording_id: UUID) -> bool:
        """
        Clean up all chunks for a recording.

        Args:
            recording_id: ID of the recording

        Returns:
            bool: True if cleaned up successfully
        """
        pass
