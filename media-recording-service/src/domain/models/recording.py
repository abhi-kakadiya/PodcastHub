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
    PAUSED = "paused"
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
    paused_at: Optional[datetime] = None
    resumed_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    created_at: datetime = field(default_factory=datetime.utcnow)
    updated_at: datetime = field(default_factory=datetime.utcnow)
    metadata: dict = field(default_factory=dict)
    pause_count: int = 0  # Track number of pauses
    total_pause_duration: float = 0.0  # Total seconds paused

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

    def pause(self) -> None:
        """
        Pause the recording.

        Business rule: Can only pause if status is RECORDING
        """
        if self.status != RecordingStatus.RECORDING:
            raise ValueError(f"Cannot pause recording in {self.status} status")

        self.status = RecordingStatus.PAUSED
        self.paused_at = datetime.utcnow()
        self.pause_count += 1
        self.updated_at = datetime.utcnow()

    def resume(self) -> None:
        """
        Resume the recording after pause.

        Business rule: Can only resume if status is PAUSED
        """
        if self.status != RecordingStatus.PAUSED:
            raise ValueError(f"Cannot resume recording in {self.status} status")

        self.status = RecordingStatus.RECORDING
        self.resumed_at = datetime.utcnow()

        # Calculate pause duration
        if self.paused_at:
            pause_duration = (self.resumed_at - self.paused_at).total_seconds()
            self.total_pause_duration += pause_duration

        self.updated_at = datetime.utcnow()

    def stop(self) -> None:
        """
        Stop the recording.

        Business rule: Can stop if status is RECORDING or PAUSED
        """
        if self.status not in (RecordingStatus.RECORDING, RecordingStatus.PAUSED):
            raise ValueError(f"Cannot stop recording in {self.status} status")

        # If paused, calculate final pause duration
        if self.status == RecordingStatus.PAUSED and self.paused_at:
            pause_duration = (datetime.utcnow() - self.paused_at).total_seconds()
            self.total_pause_duration += pause_duration

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
        """
        Calculate actual recording duration in seconds (excluding pause time).

        Returns:
            Total recording time minus time spent paused
        """
        if not self.started_at:
            return 0.0

        end_time = self.ended_at or datetime.utcnow()
        total_duration = (end_time - self.started_at).total_seconds()

        # Subtract pause duration to get actual recording time
        active_duration = total_duration - self.total_pause_duration

        # If currently paused, subtract current pause duration
        if self.status == RecordingStatus.PAUSED and self.paused_at:
            current_pause = (datetime.utcnow() - self.paused_at).total_seconds()
            active_duration -= current_pause

        return max(0.0, active_duration)  # Ensure non-negative
