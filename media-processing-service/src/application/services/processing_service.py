"""
Processing Service (Application Layer)

Orchestrates media processing workflows.
"""

from typing import List, Optional
from uuid import UUID

from src.application.ports.inbound import ProcessingServicePort
from src.application.ports.outbound import (
    JobRepositoryPort,
    EventPublisherPort,
    MediaProcessorPort,
)
from src.domain.models import ProcessingJob, JobStatus, ProcessingStep
from src.domain.events import (
    ProcessingJobCreated,
    ProcessingJobStarted,
    ProcessingJobStepCompleted,
    ProcessingJobCompleted,
    ProcessingJobFailed,
)


class ProcessingService(ProcessingServicePort):
    """
    Processing service implementation.

    Coordinates the processing of multiple media tracks into a
    final podcast file.
    """

    def __init__(
        self,
        job_repository: JobRepositoryPort,
        event_publisher: EventPublisherPort,
        media_processor: MediaProcessorPort,
    ):
        self._job_repository = job_repository
        self._event_publisher = event_publisher
        self._media_processor = media_processor

    async def create_job(
        self, session_id: str, recording_ids: List[UUID], output_format: str = "mp3"
    ) -> ProcessingJob:
        """Create a new processing job"""
        job = ProcessingJob(
            session_id=session_id,
            total_tracks=len(recording_ids),
            output_format=output_format,
            status=JobStatus.PENDING,
        )

        # Store recording IDs in metadata
        job.metadata["recording_ids"] = [str(rid) for rid in recording_ids]

        # Persist job
        job = await self._job_repository.save(job)

        # Publish event
        event = ProcessingJobCreated(
            job_id=job.job_id,
            session_id=job.session_id,
            total_tracks=job.total_tracks,
        )
        await self._event_publisher.publish(event, routing_key="processing.job.created")

        return job

    async def start_processing(self, job_id: UUID) -> ProcessingJob:
        """
        Start processing a job.

        This orchestrates the full processing pipeline:
        1. Synchronization
        2. Noise reduction
        3. Normalization
        4. Mixing
        5. Encoding
        """
        job = await self._job_repository.find_by_id(job_id)
        if not job:
            raise ValueError(f"Job {job_id} not found")

        try:
            # Start the job
            job.start()
            job = await self._job_repository.save(job)

            # Publish started event
            event = ProcessingJobStarted(
                job_id=job.job_id,
                session_id=job.session_id,
            )
            await self._event_publisher.publish(
                event, routing_key="processing.job.started"
            )

            # Step 1: Synchronization
            await self._synchronize_tracks(job)

            # Step 2: Enhancement (noise reduction + normalization)
            await self._enhance_tracks(job)

            # Step 3: Mixing
            output_path = await self._mix_tracks(job)

            # Complete the job
            job.complete(output_path)
            job = await self._job_repository.save(job)

            # Publish completion event
            completion_event = ProcessingJobCompleted(
                job_id=job.job_id,
                session_id=job.session_id,
                output_file_path=output_path,
                duration_seconds=job.processing_duration_seconds(),
            )
            await self._event_publisher.publish(
                completion_event, routing_key="processing.job.completed"
            )

            return job

        except Exception as e:
            # Mark job as failed
            job.mark_failed(str(e))
            await self._job_repository.save(job)

            # Publish failure event
            failure_event = ProcessingJobFailed(
                job_id=job.job_id,
                session_id=job.session_id,
                reason=str(e),
            )
            await self._event_publisher.publish(
                failure_event, routing_key="processing.job.failed"
            )

            raise

    async def _synchronize_tracks(self, job: ProcessingJob) -> None:
        """Synchronize all tracks"""
        # In a real implementation, this would call the media processor
        # For now, we simulate it
        job.advance_step(ProcessingStep.NOISE_REDUCTION)
        await self._job_repository.save(job)

        # Publish step completion
        event = ProcessingJobStepCompleted(
            job_id=job.job_id,
            step=ProcessingStep.SYNC.value,
        )
        await self._event_publisher.publish(
            event, routing_key="processing.job.step.completed"
        )

    async def _enhance_tracks(self, job: ProcessingJob) -> None:
        """Apply noise reduction and normalization"""
        job.advance_step(ProcessingStep.NORMALIZATION)
        await self._job_repository.save(job)

        # Publish step completion
        event = ProcessingJobStepCompleted(
            job_id=job.job_id,
            step=ProcessingStep.NOISE_REDUCTION.value,
        )
        await self._event_publisher.publish(
            event, routing_key="processing.job.step.completed"
        )

    async def _mix_tracks(self, job: ProcessingJob) -> str:
        """Mix all tracks into final output"""
        job.advance_step(ProcessingStep.MIXING)
        await self._job_repository.save(job)

        # Simulate output path
        output_path = f"processed/{job.session_id}/final.{job.output_format}"

        # Publish step completion
        event = ProcessingJobStepCompleted(
            job_id=job.job_id,
            step=ProcessingStep.MIXING.value,
        )
        await self._event_publisher.publish(
            event, routing_key="processing.job.step.completed"
        )

        return output_path

    async def get_job(self, job_id: UUID) -> Optional[ProcessingJob]:
        """Get a processing job by ID"""
        return await self._job_repository.find_by_id(job_id)

    async def get_job_status(self, job_id: UUID) -> dict:
        """Get detailed job status"""
        job = await self._job_repository.find_by_id(job_id)
        if not job:
            raise ValueError(f"Job {job_id} not found")

        return {
            "job_id": str(job.job_id),
            "session_id": job.session_id,
            "status": job.status.value,
            "current_step": job.current_step.value if job.current_step else None,
            "total_tracks": job.total_tracks,
            "processed_tracks": job.processed_tracks,
            "output_format": job.output_format,
            "output_file_path": job.output_file_path,
            "started_at": job.started_at.isoformat() if job.started_at else None,
            "completed_at": job.completed_at.isoformat() if job.completed_at else None,
            "duration_seconds": job.processing_duration_seconds(),
        }

    async def get_jobs_by_session(self, session_id: str) -> List[ProcessingJob]:
        """Get all jobs for a session"""
        return await self._job_repository.find_by_session_id(session_id)
