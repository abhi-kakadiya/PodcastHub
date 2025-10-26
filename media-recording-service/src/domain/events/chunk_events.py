"""
Chunk Domain Events

Events related to chunk capture and upload.
"""

from dataclasses import dataclass
from uuid import UUID

from .base import DomainEvent


@dataclass
class ChunkCaptured(DomainEvent):
    """
    Event emitted when a media chunk is captured locally.

    This triggers the chunk upload process.
    """

    chunk_id: UUID = None
    recording_id: UUID = None
    sequence_number: int = 0
    data_size: int = 0

    def __post_init__(self):
        self.event_type = "chunk.captured"
        self.aggregate_id = self.chunk_id

    def to_dict(self) -> dict:
        base = super().to_dict()
        base.update({
            "chunk_id": str(self.chunk_id),
            "recording_id": str(self.recording_id),
            "sequence_number": self.sequence_number,
            "data_size": self.data_size,
        })
        return base


@dataclass
class ChunkUploaded(DomainEvent):
    """
    Event emitted when a chunk is successfully uploaded.

    This updates the upload progress and checks for completion.
    """

    chunk_id: UUID = None
    recording_id: UUID = None
    upload_id: UUID = None
    sequence_number: int = 0

    def __post_init__(self):
        self.event_type = "chunk.uploaded"
        self.aggregate_id = self.chunk_id

    def to_dict(self) -> dict:
        base = super().to_dict()
        base.update({
            "chunk_id": str(self.chunk_id),
            "recording_id": str(self.recording_id),
            "upload_id": str(self.upload_id),
            "sequence_number": self.sequence_number,
        })
        return base


@dataclass
class ChunkFailed(DomainEvent):
    """Event emitted when a chunk upload fails"""

    chunk_id: UUID = None
    recording_id: UUID = None
    reason: str = ""
    can_retry: bool = False

    def __post_init__(self):
        self.event_type = "chunk.failed"
        self.aggregate_id = self.chunk_id

    def to_dict(self) -> dict:
        base = super().to_dict()
        base.update({
            "chunk_id": str(self.chunk_id),
            "recording_id": str(self.recording_id),
            "reason": self.reason,
            "can_retry": self.can_retry,
        })
        return base
