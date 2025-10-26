"""
In-Memory Chunk Repository

Implements ChunkRepositoryPort using in-memory storage.
"""

from typing import Dict, List, Optional
from uuid import UUID
import asyncio

from src.application.ports.outbound import ChunkRepositoryPort
from src.domain.models import Chunk, ChunkStatus


class InMemoryChunkRepository(ChunkRepositoryPort):
    """In-memory implementation of ChunkRepositoryPort"""

    def __init__(self):
        self._chunks: Dict[UUID, Chunk] = {}
        self._lock = asyncio.Lock()

    async def save(self, chunk: Chunk) -> Chunk:
        """Save or update a chunk"""
        async with self._lock:
            self._chunks[chunk.chunk_id] = chunk
            return chunk

    async def find_by_id(self, chunk_id: UUID) -> Optional[Chunk]:
        """Find a chunk by ID"""
        return self._chunks.get(chunk_id)

    async def find_by_recording_id(self, recording_id: UUID) -> List[Chunk]:
        """Find all chunks for a recording"""
        return [
            chunk
            for chunk in self._chunks.values()
            if chunk.recording_id == recording_id
        ]

    async def find_by_upload_id(self, upload_id: UUID) -> List[Chunk]:
        """Find all chunks for an upload (uses metadata)"""
        return [
            chunk
            for chunk in self._chunks.values()
            if chunk.metadata.get("upload_id") == str(upload_id)
        ]

    async def find_failed_chunks(self, recording_id: UUID) -> List[Chunk]:
        """Find all failed chunks for a recording that can be retried"""
        return [
            chunk
            for chunk in self._chunks.values()
            if chunk.recording_id == recording_id
            and chunk.status == ChunkStatus.FAILED
            and chunk.can_retry()
        ]

    async def count_uploaded_chunks(self, recording_id: UUID) -> int:
        """Count successfully uploaded chunks for a recording"""
        return sum(
            1
            for chunk in self._chunks.values()
            if chunk.recording_id == recording_id and chunk.is_uploaded()
        )

    async def delete(self, chunk_id: UUID) -> bool:
        """Delete a chunk"""
        async with self._lock:
            if chunk_id in self._chunks:
                del self._chunks[chunk_id]
                return True
            return False

    # Helper methods for testing
    async def clear_all(self) -> None:
        """Clear all chunks"""
        async with self._lock:
            self._chunks.clear()

    async def count(self) -> int:
        """Get total number of chunks"""
        return len(self._chunks)
