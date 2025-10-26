"""
Job Repository Port (Outbound)
"""

from abc import ABC, abstractmethod
from typing import List, Optional
from uuid import UUID

from src.domain.models import ProcessingJob


class JobRepositoryPort(ABC):
    """Outbound port for job persistence"""

    @abstractmethod
    async def save(self, job: ProcessingJob) -> ProcessingJob:
        """Save or update a job"""
        pass

    @abstractmethod
    async def find_by_id(self, job_id: UUID) -> Optional[ProcessingJob]:
        """Find a job by ID"""
        pass

    @abstractmethod
    async def find_by_session_id(self, session_id: str) -> List[ProcessingJob]:
        """Find all jobs for a session"""
        pass

    @abstractmethod
    async def delete(self, job_id: UUID) -> bool:
        """Delete a job"""
        pass
