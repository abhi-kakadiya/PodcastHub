"""
Chunk Domain Model

Represents a media chunk (piece of recorded media data).
Chunks are uploaded incrementally to support resilient uploads.
"""

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from uuid import UUID, uuid4


class ChunkStatus(str, Enum):
    """Chunk upload status"""
    PENDING = "pending"
    UPLOADING = "uploading"
    UPLOADED = "uploaded"
    FAILED = "failed"


@dataclass
class Chunk:
    """
    Chunk value object.

    Represents a piece of media data that is uploaded incrementally.
    This supports the resilient upload pattern where large files are
    split into smaller chunks.
    """

    chunk_id: UUID = field(default_factory=uuid4)
    recording_id: UUID = None
    sequence_number: int = 0
    data_size: int = 0  # Size in bytes
    checksum: str = ""  # MD5 or SHA256 hash for integrity
    status: ChunkStatus = ChunkStatus.PENDING
    retry_count: int = 0
    max_retries: int = 3
    uploaded_at: datetime = None
    created_at: datetime = field(default_factory=datetime.utcnow)
    metadata: dict = field(default_factory=dict)

    def mark_uploading(self) -> None:
        """Mark chunk as currently uploading"""
        if self.status == ChunkStatus.UPLOADED:
            raise ValueError("Cannot re-upload an already uploaded chunk")

        self.status = ChunkStatus.UPLOADING

    def mark_uploaded(self) -> None:
        """Mark chunk as successfully uploaded"""
        self.status = ChunkStatus.UPLOADED
        self.uploaded_at = datetime.utcnow()

    def mark_failed(self) -> None:
        """Mark chunk upload as failed"""
        self.status = ChunkStatus.FAILED
        self.retry_count += 1

    def can_retry(self) -> bool:
        """Check if chunk can be retried"""
        return self.retry_count < self.max_retries and self.status == ChunkStatus.FAILED

    def is_uploaded(self) -> bool:
        """Check if chunk is successfully uploaded"""
        return self.status == ChunkStatus.UPLOADED

    def validate_checksum(self, provided_checksum: str) -> bool:
        """Validate chunk integrity using checksum"""
        return self.checksum == provided_checksum
