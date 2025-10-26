"""
Track Domain Model

Represents an individual audio/video track to be processed.
"""

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from uuid import UUID, uuid4


class TrackType(str, Enum):
    """Type of media track"""

    AUDIO = "audio"
    VIDEO = "video"
    SCREEN = "screen"


@dataclass
class Track:
    """
    Track value object.

    Represents an individual recording track that needs to be
    synchronized and processed with other tracks.
    """

    track_id: UUID = field(default_factory=uuid4)
    job_id: UUID = None
    recording_id: UUID = None
    participant_id: str = ""
    track_type: TrackType = TrackType.AUDIO
    file_path: str = ""
    duration_ms: int = 0  # Duration in milliseconds
    timestamp_offset_ms: int = 0  # Sync offset in milliseconds
    is_synchronized: bool = False
    is_enhanced: bool = False
    created_at: datetime = field(default_factory=datetime.utcnow)
    metadata: dict = field(default_factory=dict)

    def synchronize(self, offset_ms: int) -> None:
        """Apply synchronization offset"""
        self.timestamp_offset_ms = offset_ms
        self.is_synchronized = True

    def mark_enhanced(self) -> None:
        """Mark track as enhanced (noise reduction, normalization)"""
        self.is_enhanced = True
