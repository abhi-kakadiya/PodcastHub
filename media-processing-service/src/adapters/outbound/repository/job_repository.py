"""
In-Memory Job Repository
"""

from typing import Dict, List, Optional
from uuid import UUID
import asyncio

from src.application.ports.outbound import JobRepositoryPort
from src.domain.models import ProcessingJob


class InMemoryJobRepository(JobRepositoryPort):
    """In-memory implementation of JobRepositoryPort"""

    def __init__(self):
        self._jobs: Dict[UUID, ProcessingJob] = {}
        self._lock = asyncio.Lock()

    async def save(self, job: ProcessingJob) -> ProcessingJob:
        """Save or update a job"""
        async with self._lock:
            self._jobs[job.job_id] = job
            return job

    async def find_by_id(self, job_id: UUID) -> Optional[ProcessingJob]:
        """Find a job by ID"""
        return self._jobs.get(job_id)

    async def find_by_session_id(self, session_id: str) -> List[ProcessingJob]:
        """Find all jobs for a session"""
        return [job for job in self._jobs.values() if job.session_id == session_id]

    async def delete(self, job_id: UUID) -> bool:
        """Delete a job"""
        async with self._lock:
            if job_id in self._jobs:
                del self._jobs[job_id]
                return True
            return False
