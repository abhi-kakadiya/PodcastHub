"""
In-Memory Upload Repository

Implements UploadRepositoryPort using in-memory storage.
"""

from typing import Dict, List, Optional
from uuid import UUID
import asyncio

from src.application.ports.outbound import UploadRepositoryPort
from src.domain.models import Upload


class InMemoryUploadRepository(UploadRepositoryPort):
    """In-memory implementation of UploadRepositoryPort"""

    def __init__(self):
        self._uploads: Dict[UUID, Upload] = {}
        self._lock = asyncio.Lock()

    async def save(self, upload: Upload) -> Upload:
        """Save or update an upload"""
        async with self._lock:
            self._uploads[upload.upload_id] = upload
            return upload

    async def find_by_id(self, upload_id: UUID) -> Optional[Upload]:
        """Find an upload by ID"""
        return self._uploads.get(upload_id)

    async def find_by_recording_id(self, recording_id: UUID) -> Optional[Upload]:
        """Find an upload by recording ID"""
        for upload in self._uploads.values():
            if upload.recording_id == recording_id:
                return upload
        return None

    async def find_by_session_id(self, session_id: str) -> List[Upload]:
        """Find all uploads for a session"""
        return [
            upload
            for upload in self._uploads.values()
            if upload.session_id == session_id
        ]

    async def delete(self, upload_id: UUID) -> bool:
        """Delete an upload"""
        async with self._lock:
            if upload_id in self._uploads:
                del self._uploads[upload_id]
                return True
            return False

    async def exists(self, upload_id: UUID) -> bool:
        """Check if an upload exists"""
        return upload_id in self._uploads

    # Helper methods for testing
    async def clear_all(self) -> None:
        """Clear all uploads"""
        async with self._lock:
            self._uploads.clear()

    async def count(self) -> int:
        """Get total number of uploads"""
        return len(self._uploads)
