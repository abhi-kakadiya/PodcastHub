"""
Upload Repository Port (Outbound)

Defines the contract for upload persistence.
"""

from abc import ABC, abstractmethod
from typing import List, Optional
from uuid import UUID

from src.domain.models import Upload


class UploadRepositoryPort(ABC):
    """Outbound port for upload persistence"""

    @abstractmethod
    async def save(self, upload: Upload) -> Upload:
        """Save or update an upload"""
        pass

    @abstractmethod
    async def find_by_id(self, upload_id: UUID) -> Optional[Upload]:
        """Find an upload by ID"""
        pass

    @abstractmethod
    async def find_by_recording_id(self, recording_id: UUID) -> Optional[Upload]:
        """Find an upload by recording ID"""
        pass

    @abstractmethod
    async def find_by_session_id(self, session_id: str) -> List[Upload]:
        """Find all uploads for a session"""
        pass

    @abstractmethod
    async def delete(self, upload_id: UUID) -> bool:
        """Delete an upload"""
        pass

    @abstractmethod
    async def exists(self, upload_id: UUID) -> bool:
        """Check if an upload exists"""
        pass
