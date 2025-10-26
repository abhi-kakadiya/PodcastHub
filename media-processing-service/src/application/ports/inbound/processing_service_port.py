"""
Processing Service Port (Inbound)
"""

from abc import ABC, abstractmethod
from typing import List, Optional
from uuid import UUID

from src.domain.models import ProcessingJob, Track


class ProcessingServicePort(ABC):
    """Inbound port for media processing operations"""

    @abstractmethod
    async def create_job(
        self, session_id: str, recording_ids: List[UUID], output_format: str = "mp3"
    ) -> ProcessingJob:
        """Create a new processing job"""
        pass

    @abstractmethod
    async def start_processing(self, job_id: UUID) -> ProcessingJob:
        """Start processing a job"""
        pass

    @abstractmethod
    async def get_job(self, job_id: UUID) -> Optional[ProcessingJob]:
        """Get a processing job by ID"""
        pass

    @abstractmethod
    async def get_job_status(self, job_id: UUID) -> dict:
        """Get detailed job status"""
        pass

    @abstractmethod
    async def get_jobs_by_session(self, session_id: str) -> List[ProcessingJob]:
        """Get all jobs for a session"""
        pass
