"""
Processing Domain Events

Events emitted by the media processing worker once stitched output is available.
"""

from dataclasses import dataclass
from typing import Union
from uuid import UUID

from .base import DomainEvent


@dataclass
class RecordingProcessed(DomainEvent):
    """Event emitted when a recording has been stitched and stored."""

    recording_id: Union[UUID, str] = ""
    session_id: str = ""
    participant_id: str = ""
    track_type: str = ""
    processed_minio_path: str = ""
    chunk_count: int = 0
    size_bytes: int = 0

    def __post_init__(self):
        self.event_type = "recording.processed"
        self.aggregate_id = str(self.recording_id)

    def to_dict(self) -> dict:
        base = super().to_dict()
        base.update(
            {
                "recording_id": str(self.recording_id),
                "session_id": self.session_id,
                "participant_id": self.participant_id,
                "track_type": self.track_type,
                "processed_minio_path": self.processed_minio_path,
                "chunk_count": self.chunk_count,
                "size_bytes": self.size_bytes,
            }
        )
        return base
