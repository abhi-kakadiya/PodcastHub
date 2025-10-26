"""
Processing Job Domain Events
"""

from dataclasses import dataclass
from uuid import UUID

from .base import DomainEvent


@dataclass
class ProcessingJobCreated(DomainEvent):
    """Event emitted when a processing job is created"""

    job_id: UUID = None
    session_id: str = ""
    total_tracks: int = 0

    def __post_init__(self):
        self.event_type = "processing.job.created"
        self.aggregate_id = self.job_id

    def to_dict(self) -> dict:
        base = super().to_dict()
        base.update({
            "job_id": str(self.job_id),
            "session_id": self.session_id,
            "total_tracks": self.total_tracks,
        })
        return base


@dataclass
class ProcessingJobStarted(DomainEvent):
    """Event emitted when processing begins"""

    job_id: UUID = None
    session_id: str = ""

    def __post_init__(self):
        self.event_type = "processing.job.started"
        self.aggregate_id = self.job_id

    def to_dict(self) -> dict:
        base = super().to_dict()
        base.update({
            "job_id": str(self.job_id),
            "session_id": self.session_id,
        })
        return base


@dataclass
class ProcessingJobStepCompleted(DomainEvent):
    """Event emitted when a processing step completes"""

    job_id: UUID = None
    step: str = ""

    def __post_init__(self):
        self.event_type = "processing.job.step.completed"
        self.aggregate_id = self.job_id

    def to_dict(self) -> dict:
        base = super().to_dict()
        base.update({
            "job_id": str(self.job_id),
            "step": self.step,
        })
        return base


@dataclass
class ProcessingJobCompleted(DomainEvent):
    """
    Event emitted when processing completes successfully.

    This is a critical event that triggers notifications and
    makes the processed content available to users.
    """

    job_id: UUID = None
    session_id: str = ""
    output_file_path: str = ""
    duration_seconds: float = 0.0

    def __post_init__(self):
        self.event_type = "processing.job.completed"
        self.aggregate_id = self.job_id

    def to_dict(self) -> dict:
        base = super().to_dict()
        base.update({
            "job_id": str(self.job_id),
            "session_id": self.session_id,
            "output_file_path": self.output_file_path,
            "duration_seconds": self.duration_seconds,
        })
        return base


@dataclass
class ProcessingJobFailed(DomainEvent):
    """Event emitted when processing fails"""

    job_id: UUID = None
    session_id: str = ""
    reason: str = ""

    def __post_init__(self):
        self.event_type = "processing.job.failed"
        self.aggregate_id = self.job_id

    def to_dict(self) -> dict:
        base = super().to_dict()
        base.update({
            "job_id": str(self.job_id),
            "session_id": self.session_id,
            "reason": self.reason,
        })
        return base
