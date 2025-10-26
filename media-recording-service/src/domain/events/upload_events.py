"""
Upload Domain Events

Events related to the overall upload process.
"""

from dataclasses import dataclass
from uuid import UUID

from .base import DomainEvent


@dataclass
class UploadStarted(DomainEvent):
    """Event emitted when an upload session starts"""

    upload_id: UUID = None
    recording_id: UUID = None
    session_id: str = ""
    file_name: str = ""

    def __post_init__(self):
        self.event_type = "upload.started"
        self.aggregate_id = self.upload_id

    def to_dict(self) -> dict:
        base = super().to_dict()
        base.update({
            "upload_id": str(self.upload_id),
            "recording_id": str(self.recording_id),
            "session_id": self.session_id,
            "file_name": self.file_name,
        })
        return base


@dataclass
class UploadCompleted(DomainEvent):
    """
    Event emitted when all chunks are uploaded successfully.

    This is a critical event that triggers the media processing service
    to begin synchronization and processing.
    """

    upload_id: UUID = None
    recording_id: UUID = None
    session_id: str = ""
    total_chunks: int = 0
    total_size_bytes: int = 0
    file_name: str = ""

    def __post_init__(self):
        self.event_type = "upload.completed"
        self.aggregate_id = self.upload_id

    def to_dict(self) -> dict:
        base = super().to_dict()
        base.update({
            "upload_id": str(self.upload_id),
            "recording_id": str(self.recording_id),
            "session_id": self.session_id,
            "total_chunks": self.total_chunks,
            "total_size_bytes": self.total_size_bytes,
            "file_name": self.file_name,
        })
        return base


@dataclass
class UploadFailed(DomainEvent):
    """Event emitted when an upload fails"""

    upload_id: UUID = None
    recording_id: UUID = None
    session_id: str = ""
    reason: str = ""

    def __post_init__(self):
        self.event_type = "upload.failed"
        self.aggregate_id = self.upload_id

    def to_dict(self) -> dict:
        base = super().to_dict()
        base.update({
            "upload_id": str(self.upload_id),
            "recording_id": str(self.recording_id),
            "session_id": self.session_id,
            "reason": self.reason,
        })
        return base
