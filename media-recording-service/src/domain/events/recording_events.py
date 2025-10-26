"""
Recording Domain Events

Events related to recording lifecycle.
"""

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from .base import DomainEvent


@dataclass
class RecordingStarted(DomainEvent):
    """
    Event emitted when a recording starts.

    This event triggers various downstream processes like
    preparing storage, notifying other services, etc.
    """

    recording_id: UUID = None
    session_id: str = ""
    participant_id: str = ""
    media_type: str = ""
    started_at: datetime = None

    def __post_init__(self):
        self.event_type = "recording.started"
        self.aggregate_id = self.recording_id

    def to_dict(self) -> dict:
        base = super().to_dict()
        base.update({
            "recording_id": str(self.recording_id),
            "session_id": self.session_id,
            "participant_id": self.participant_id,
            "media_type": self.media_type,
            "started_at": self.started_at.isoformat() if self.started_at else None,
        })
        return base


@dataclass
class RecordingEnded(DomainEvent):
    """
    Event emitted when a recording ends.

    This event triggers the upload completion check and
    potentially the processing pipeline.
    """

    recording_id: UUID = None
    session_id: str = ""
    participant_id: str = ""
    ended_at: datetime = None
    duration_seconds: float = 0.0

    def __post_init__(self):
        self.event_type = "recording.ended"
        self.aggregate_id = self.recording_id

    def to_dict(self) -> dict:
        base = super().to_dict()
        base.update({
            "recording_id": str(self.recording_id),
            "session_id": self.session_id,
            "participant_id": self.participant_id,
            "ended_at": self.ended_at.isoformat() if self.ended_at else None,
            "duration_seconds": self.duration_seconds,
        })
        return base


@dataclass
class RecordingPaused(DomainEvent):
    """
    Event emitted when a recording is paused.

    Allows the meeting to continue while recording is paused.
    """

    recording_id: UUID = None
    session_id: str = ""
    participant_id: str = ""
    paused_at: datetime = None

    def __post_init__(self):
        self.event_type = "recording.paused"
        self.aggregate_id = self.recording_id

    def to_dict(self) -> dict:
        base = super().to_dict()
        base.update({
            "recording_id": str(self.recording_id),
            "session_id": self.session_id,
            "participant_id": self.participant_id,
            "paused_at": self.paused_at.isoformat() if self.paused_at else None,
        })
        return base


@dataclass
class RecordingResumed(DomainEvent):
    """
    Event emitted when a recording is resumed after pause.
    """

    recording_id: UUID = None
    session_id: str = ""
    participant_id: str = ""
    resumed_at: datetime = None

    def __post_init__(self):
        self.event_type = "recording.resumed"
        self.aggregate_id = self.recording_id

    def to_dict(self) -> dict:
        base = super().to_dict()
        base.update({
            "recording_id": str(self.recording_id),
            "session_id": self.session_id,
            "participant_id": self.participant_id,
            "resumed_at": self.resumed_at.isoformat() if self.resumed_at else None,
        })
        return base


@dataclass
class RecordingFailed(DomainEvent):
    """Event emitted when a recording fails"""

    recording_id: UUID = None
    session_id: str = ""
    reason: str = ""

    def __post_init__(self):
        self.event_type = "recording.failed"
        self.aggregate_id = self.recording_id

    def to_dict(self) -> dict:
        base = super().to_dict()
        base.update({
            "recording_id": str(self.recording_id),
            "session_id": self.session_id,
            "reason": self.reason,
        })
        return base
