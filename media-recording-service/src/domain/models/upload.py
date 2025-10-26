"""
Upload Domain Model

Represents the overall upload session for a recording.
Aggregates multiple chunks into a complete upload.
"""

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import List, Optional
from uuid import UUID, uuid4


class UploadStatus(str, Enum):
    """Upload session status"""
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class Upload:
    """
    Upload aggregate.

    Manages the upload of all chunks for a recording.
    Tracks progress and ensures all chunks are uploaded successfully.
    """

    upload_id: UUID = field(default_factory=uuid4)
    recording_id: UUID = None
    session_id: str = ""
    status: UploadStatus = UploadStatus.IN_PROGRESS
    total_chunks: int = 0
    uploaded_chunks: int = 0
    total_size_bytes: int = 0
    uploaded_size_bytes: int = 0
    file_name: str = ""
    mime_type: str = ""
    started_at: datetime = field(default_factory=datetime.utcnow)
    completed_at: Optional[datetime] = None
    metadata: dict = field(default_factory=dict)

    def add_chunk(self, chunk_size: int) -> None:
        """Register a new chunk for upload"""
        self.total_chunks += 1
        self.total_size_bytes += chunk_size

    def mark_chunk_uploaded(self, chunk_size: int) -> None:
        """Mark a chunk as uploaded and update progress"""
        self.uploaded_chunks += 1
        self.uploaded_size_bytes += chunk_size

        # Check if all chunks are uploaded
        if self.uploaded_chunks >= self.total_chunks and self.total_chunks > 0:
            self.complete()

    def complete(self) -> None:
        """Mark upload as completed"""
        if self.uploaded_chunks < self.total_chunks:
            raise ValueError(
                f"Cannot complete upload: {self.uploaded_chunks}/{self.total_chunks} chunks uploaded"
            )

        self.status = UploadStatus.COMPLETED
        self.completed_at = datetime.utcnow()

    def cancel(self) -> None:
        """Cancel the upload"""
        if self.status == UploadStatus.COMPLETED:
            raise ValueError("Cannot cancel a completed upload")

        self.status = UploadStatus.CANCELLED

    def mark_failed(self, reason: str = "") -> None:
        """Mark upload as failed"""
        self.status = UploadStatus.FAILED
        self.metadata["failure_reason"] = reason

    def progress_percentage(self) -> float:
        """Calculate upload progress percentage"""
        if self.total_chunks == 0:
            return 0.0

        return (self.uploaded_chunks / self.total_chunks) * 100

    def is_completed(self) -> bool:
        """Check if upload is completed"""
        return self.status == UploadStatus.COMPLETED

    def is_in_progress(self) -> bool:
        """Check if upload is in progress"""
        return self.status == UploadStatus.IN_PROGRESS
