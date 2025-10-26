"""
Processing Job Domain Model

Represents a media processing job that synchronizes and processes
multiple audio/video tracks.
"""

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import List, Optional
from uuid import UUID, uuid4


class JobStatus(str, Enum):
    """Processing job status"""

    PENDING = "pending"
    SYNCHRONIZING = "synchronizing"
    ENHANCING = "enhancing"
    MIXING = "mixing"
    COMPLETED = "completed"
    FAILED = "failed"


class ProcessingStep(str, Enum):
    """Processing pipeline steps"""

    SYNC = "synchronization"
    NOISE_REDUCTION = "noise_reduction"
    NORMALIZATION = "normalization"
    MIXING = "mixing"
    ENCODING = "encoding"


@dataclass
class ProcessingJob:
    """
    Processing Job aggregate root.

    Manages the processing of multiple tracks into a final podcast file.
    """

    job_id: UUID = field(default_factory=uuid4)
    session_id: str = ""
    status: JobStatus = JobStatus.PENDING
    total_tracks: int = 0
    processed_tracks: int = 0
    current_step: Optional[ProcessingStep] = None
    output_format: str = "mp3"  # mp3, wav, mp4
    output_file_path: str = ""
    created_at: datetime = field(default_factory=datetime.utcnow)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    metadata: dict = field(default_factory=dict)
    processing_options: dict = field(default_factory=dict)

    def start(self) -> None:
        """Start processing"""
        if self.status != JobStatus.PENDING:
            raise ValueError(f"Cannot start job in {self.status} status")

        self.status = JobStatus.SYNCHRONIZING
        self.current_step = ProcessingStep.SYNC
        self.started_at = datetime.utcnow()

    def advance_step(self, next_step: ProcessingStep) -> None:
        """Move to next processing step"""
        self.current_step = next_step

        # Update status based on step
        if next_step == ProcessingStep.NOISE_REDUCTION:
            self.status = JobStatus.ENHANCING
        elif next_step == ProcessingStep.MIXING:
            self.status = JobStatus.MIXING

    def complete(self, output_path: str) -> None:
        """Mark job as completed"""
        self.status = JobStatus.COMPLETED
        self.output_file_path = output_path
        self.completed_at = datetime.utcnow()
        self.processed_tracks = self.total_tracks

    def mark_failed(self, reason: str) -> None:
        """Mark job as failed"""
        self.status = JobStatus.FAILED
        self.metadata["failure_reason"] = reason
        self.metadata["failed_at"] = datetime.utcnow().isoformat()

    def is_completed(self) -> bool:
        """Check if job is completed"""
        return self.status == JobStatus.COMPLETED

    def processing_duration_seconds(self) -> float:
        """Calculate processing duration"""
        if not self.started_at:
            return 0.0

        end_time = self.completed_at or datetime.utcnow()
        return (end_time - self.started_at).total_seconds()
