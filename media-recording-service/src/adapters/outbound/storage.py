"""
In-Memory Storage Adapter

Implements StoragePort using in-memory storage.
In production, this would be replaced with S3, Azure Blob, etc.
"""

from typing import Dict, Optional
from uuid import UUID
import asyncio

from src.application.ports.outbound import StoragePort


class InMemoryStorage(StoragePort):
    """
    In-memory implementation of StoragePort.

    Stores chunk data in memory. In production, this would use
    cloud storage like S3, Azure Blob Storage, or Google Cloud Storage.
    """

    def __init__(self):
        self._storage: Dict[UUID, bytes] = {}
        self._metadata: Dict[UUID, dict] = {}
        self._lock = asyncio.Lock()

    async def store_chunk(
        self,
        chunk_id: UUID,
        recording_id: UUID,
        data: bytes,
        metadata: dict = None,
    ) -> str:
        """
        Store a chunk of data in memory.

        Returns:
            Storage path (simulated as string key)
        """
        async with self._lock:
            self._storage[chunk_id] = data
            self._metadata[chunk_id] = metadata or {}
            self._metadata[chunk_id]["recording_id"] = str(recording_id)

            # Simulate storage path
            storage_path = f"in-memory://{recording_id}/{chunk_id}"

            return storage_path

    async def retrieve_chunk(self, chunk_id: UUID) -> Optional[bytes]:
        """Retrieve a chunk by ID"""
        return self._storage.get(chunk_id)

    async def delete_chunk(self, chunk_id: UUID) -> bool:
        """Delete a chunk"""
        async with self._lock:
            if chunk_id in self._storage:
                del self._storage[chunk_id]
                if chunk_id in self._metadata:
                    del self._metadata[chunk_id]
                return True
            return False

    async def get_storage_path(self, recording_id: UUID) -> str:
        """Get the storage path for a recording"""
        return f"in-memory://{recording_id}/"

    async def cleanup_recording(self, recording_id: UUID) -> bool:
        """Clean up all chunks for a recording"""
        async with self._lock:
            chunks_to_delete = [
                chunk_id
                for chunk_id, meta in self._metadata.items()
                if meta.get("recording_id") == str(recording_id)
            ]

            for chunk_id in chunks_to_delete:
                if chunk_id in self._storage:
                    del self._storage[chunk_id]
                if chunk_id in self._metadata:
                    del self._metadata[chunk_id]

            return len(chunks_to_delete) > 0

    # Helper methods for testing
    async def get_total_size(self) -> int:
        """Get total size of all stored data"""
        return sum(len(data) for data in self._storage.values())

    async def get_chunk_count(self) -> int:
        """Get total number of stored chunks"""
        return len(self._storage)

    async def clear_all(self) -> None:
        """Clear all stored data"""
        async with self._lock:
            self._storage.clear()
            self._metadata.clear()
