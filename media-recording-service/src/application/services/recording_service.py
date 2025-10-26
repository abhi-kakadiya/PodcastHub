"""
Recording Service (Application Layer)

Implements the recording use cases by orchestrating domain models
and outbound ports.
"""

from typing import List, Optional
from uuid import UUID

from src.application.ports.inbound import RecordingServicePort
from src.application.ports.outbound import (
    RecordingRepositoryPort,
    UploadRepositoryPort,
    EventPublisherPort,
)
from src.domain.models import Recording, RecordingStatus
from src.domain.events import RecordingStarted, RecordingEnded, RecordingFailed
from src.domain.exceptions import (
    RecordingNotFoundException,
    InvalidRecordingStateException,
)


class RecordingService(RecordingServicePort):
    """
    Recording service implementation.

    This is where the business logic lives. It coordinates between
    domain models and outbound adapters (repositories, event publishers).

    Key principles:
    - Depends on abstractions (ports), not concretions
    - Implements inbound port interface
    - Uses outbound ports for external interactions
    """

    def __init__(
        self,
        recording_repository: RecordingRepositoryPort,
        upload_repository: UploadRepositoryPort,
        event_publisher: EventPublisherPort,
    ):
        """
        Initialize the service with required dependencies.

        Args:
            recording_repository: Repository for recording persistence
            upload_repository: Repository for upload data
            event_publisher: Publisher for domain events
        """
        self._recording_repository = recording_repository
        self._upload_repository = upload_repository
        self._event_publisher = event_publisher

    async def start_recording(
        self,
        session_id: str,
        participant_id: str,
        track_type: str = "audio",
    ) -> Recording:
        """
        Start a new recording session.

        This method:
        1. Creates a new recording domain model
        2. Calls the domain method to start recording
        3. Persists the recording
        4. Publishes a RecordingStarted event
        """
        from src.domain.models import TrackType

        # Create recording aggregate
        recording = Recording(
            session_id=session_id,
            participant_id=participant_id,
            track_type=TrackType(track_type),
            status=RecordingStatus.WAITING,
        )

        # Use domain logic to start recording
        try:
            recording.start()
        except ValueError as e:
            raise InvalidRecordingStateException(str(e))

        # Persist the recording
        recording = await self._recording_repository.save(recording)

        # Publish domain event
        event = RecordingStarted(
            recording_id=recording.recording_id,
            session_id=recording.session_id,
            participant_id=recording.participant_id,
            media_type=recording.track_type.value,
            started_at=recording.started_at,
        )
        await self._event_publisher.publish(event, routing_key="recording.started")

        return recording

    async def stop_recording(self, recording_id: UUID) -> Recording:
        """
        Stop an active recording.

        This method:
        1. Retrieves the recording
        2. Calls the domain method to stop recording
        3. Persists the updated recording
        4. Publishes a RecordingEnded event
        """
        # Retrieve recording
        recording = await self._recording_repository.find_by_id(recording_id)
        if not recording:
            raise RecordingNotFoundException(f"Recording {recording_id} not found")

        # Use domain logic to stop recording
        try:
            recording.stop()
        except ValueError as e:
            raise InvalidRecordingStateException(str(e))

        # Persist the updated recording
        recording = await self._recording_repository.save(recording)

        # Publish domain event
        event = RecordingEnded(
            recording_id=recording.recording_id,
            session_id=recording.session_id,
            participant_id=recording.participant_id,
            ended_at=recording.ended_at,
            duration_seconds=recording.duration_seconds(),
        )
        await self._event_publisher.publish(event, routing_key="recording.ended")

        return recording

    async def pause_recording(self, recording_id: UUID) -> Recording:
        """
        Pause an active recording.

        This method:
        1. Retrieves the recording
        2. Calls the domain method to pause recording
        3. Persists the updated recording
        4. Publishes a RecordingPaused event
        """
        # Retrieve recording
        recording = await self._recording_repository.find_by_id(recording_id)
        if not recording:
            raise RecordingNotFoundException(f"Recording {recording_id} not found")

        # Use domain logic to pause recording
        try:
            recording.pause()
        except ValueError as e:
            raise InvalidRecordingStateException(str(e))

        # Persist the updated recording
        recording = await self._recording_repository.save(recording)

        # Publish domain event
        from src.domain.events import RecordingPaused
        event = RecordingPaused(
            recording_id=recording.recording_id,
            session_id=recording.session_id,
            participant_id=recording.participant_id,
            paused_at=recording.paused_at,
        )
        await self._event_publisher.publish(event, routing_key="recording.paused")

        return recording

    async def resume_recording(self, recording_id: UUID) -> Recording:
        """
        Resume a paused recording.

        This method:
        1. Retrieves the recording
        2. Calls the domain method to resume recording
        3. Persists the updated recording
        4. Publishes a RecordingResumed event
        """
        # Retrieve recording
        recording = await self._recording_repository.find_by_id(recording_id)
        if not recording:
            raise RecordingNotFoundException(f"Recording {recording_id} not found")

        # Use domain logic to resume recording
        try:
            recording.resume()
        except ValueError as e:
            raise InvalidRecordingStateException(str(e))

        # Persist the updated recording
        recording = await self._recording_repository.save(recording)

        # Publish domain event
        from src.domain.events import RecordingResumed
        event = RecordingResumed(
            recording_id=recording.recording_id,
            session_id=recording.session_id,
            participant_id=recording.participant_id,
            resumed_at=recording.resumed_at,
        )
        await self._event_publisher.publish(event, routing_key="recording.resumed")

        return recording

    async def get_recording(self, recording_id: UUID) -> Optional[Recording]:
        """Get a recording by ID"""
        return await self._recording_repository.find_by_id(recording_id)

    async def get_recordings_by_session(self, session_id: str) -> List[Recording]:
        """Get all recordings for a session"""
        return await self._recording_repository.find_by_session_id(session_id)

    async def get_recording_status(self, recording_id: UUID) -> dict:
        """
        Get detailed status including upload progress.

        This demonstrates cross-aggregate queries while maintaining
        proper boundaries.
        """
        recording = await self._recording_repository.find_by_id(recording_id)
        if not recording:
            raise RecordingNotFoundException(f"Recording {recording_id} not found")

        # Get associated upload if exists
        upload = await self._upload_repository.find_by_recording_id(recording_id)

        status = {
            "recording_id": str(recording.recording_id),
            "session_id": recording.session_id,
            "participant_id": recording.participant_id,
            "status": recording.status.value,
            "track_type": recording.track_type.value,
            "started_at": recording.started_at.isoformat() if recording.started_at else None,
            "ended_at": recording.ended_at.isoformat() if recording.ended_at else None,
            "duration_seconds": recording.duration_seconds(),
        }

        if upload:
            status["upload"] = {
                "upload_id": str(upload.upload_id),
                "status": upload.status.value,
                "progress_percentage": upload.progress_percentage(),
                "uploaded_chunks": upload.uploaded_chunks,
                "total_chunks": upload.total_chunks,
                "uploaded_size_bytes": upload.uploaded_size_bytes,
                "total_size_bytes": upload.total_size_bytes,
            }

        return status

    async def mark_recording_failed(self, recording_id: UUID, reason: str) -> Recording:
        """
        Mark a recording as failed.

        This is typically called when an unrecoverable error occurs.
        """
        recording = await self._recording_repository.find_by_id(recording_id)
        if not recording:
            raise RecordingNotFoundException(f"Recording {recording_id} not found")

        recording.mark_failed(reason)
        recording = await self._recording_repository.save(recording)

        # Publish failure event
        event = RecordingFailed(
            recording_id=recording.recording_id,
            session_id=recording.session_id,
            reason=reason,
        )
        await self._event_publisher.publish(event, routing_key="recording.failed")

        return recording
