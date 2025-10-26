"""
Recording Domain Model

Represents a recording session in the domain.
This is a pure domain model with no external dependencies.
"""

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Optional
from uuid import UUID, uuid4


class RecordingStatus(str, Enum):
    """Recording status enumeration"""
    WAITING = "waiting"
    RECORDING = "recording"
    STOPPED = "stopped"
    FAILED = "failed"


@dataclass
class Recording:
    """
    Recording aggregate root.

    Represents a recording session with its state and metadata.
    This follows DDD principles where Recording is an aggregate root
    that maintains consistency boundaries.
    """

    recording_id: UUID = field(default_factory=uuid4)
    session_id: str = ""
    participant_id: str = ""
    status: RecordingStatus = RecordingStatus.WAITING
    media_type: str = "audio"  # audio, video, screen
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    created_at: datetime = field(default_factory=datetime.utcnow)
    updated_at: datetime = field(default_factory=datetime.utcnow)
    metadata: dict = field(default_factory=dict)

    def start(self) -> None:
        """
        Start the recording.

        Business rule: Can only start if status is WAITING
        """
        if self.status != RecordingStatus.WAITING:
            raise ValueError(f"Cannot start recording in {self.status} status")

        self.status = RecordingStatus.RECORDING
        self.started_at = datetime.utcnow()
        self.updated_at = datetime.utcnow()

    def stop(self) -> None:
        """
        Stop the recording.

        Business rule: Can only stop if status is RECORDING
        """
        if self.status != RecordingStatus.RECORDING:
            raise ValueError(f"Cannot stop recording in {self.status} status")

        self.status = RecordingStatus.STOPPED
        self.ended_at = datetime.utcnow()
        self.updated_at = datetime.utcnow()

    def mark_failed(self, reason: str = "") -> None:
        """Mark recording as failed with optional reason"""
        self.status = RecordingStatus.FAILED
        self.metadata["failure_reason"] = reason
        self.updated_at = datetime.utcnow()

    def is_active(self) -> bool:
        """Check if recording is currently active"""
        return self.status == RecordingStatus.RECORDING

    def duration_seconds(self) -> float:
        """Calculate recording duration in seconds"""
        if not self.started_at:
            return 0.0

        end_time = self.ended_at or datetime.utcnow()
        return (end_time - self.started_at).total_seconds()
