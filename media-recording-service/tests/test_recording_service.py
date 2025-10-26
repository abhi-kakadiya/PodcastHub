"""
Test Suite for Recording Service

Tests the core business logic following hexagonal architecture principles.
Tests focus on the domain layer and application services.
"""

import pytest
from uuid import UUID, uuid4
from datetime import datetime

from src.domain.models import Recording, RecordingStatus
from src.domain.exceptions import InvalidRecordingStateException
from src.application.services import RecordingService
from src.adapters.outbound.repository import (
    InMemoryRecordingRepository,
    InMemoryUploadRepository,
)


class MockEventPublisher:
    """Mock event publisher for testing"""

    def __init__(self):
        self.published_events = []

    async def publish(self, event, routing_key=""):
        self.published_events.append((event, routing_key))

    async def publish_batch(self, events):
        self.published_events.extend([(e, "") for e in events])


@pytest.fixture
def recording_repository():
    """Fixture for recording repository"""
    return InMemoryRecordingRepository()


@pytest.fixture
def upload_repository():
    """Fixture for upload repository"""
    return InMemoryUploadRepository()


@pytest.fixture
def event_publisher():
    """Fixture for event publisher"""
    return MockEventPublisher()


@pytest.fixture
def recording_service(recording_repository, upload_repository, event_publisher):
    """Fixture for recording service"""
    return RecordingService(
        recording_repository=recording_repository,
        upload_repository=upload_repository,
        event_publisher=event_publisher,
    )


class TestRecordingDomainModel:
    """Test Recording domain model business logic"""

    def test_create_recording(self):
        """Test creating a new recording"""
        recording = Recording(
            session_id="session_123",
            participant_id="user_456",
            media_type="audio",
        )

        assert recording.recording_id is not None
        assert recording.session_id == "session_123"
        assert recording.participant_id == "user_456"
        assert recording.status == RecordingStatus.WAITING

    def test_start_recording(self):
        """Test starting a recording"""
        recording = Recording(
            session_id="session_123",
            participant_id="user_456",
        )

        recording.start()

        assert recording.status == RecordingStatus.RECORDING
        assert recording.started_at is not None
        assert recording.is_active() is True

    def test_cannot_start_already_recording(self):
        """Test that cannot start an already recording session"""
        recording = Recording(
            session_id="session_123",
            participant_id="user_456",
        )

        recording.start()

        with pytest.raises(ValueError):
            recording.start()

    def test_stop_recording(self):
        """Test stopping a recording"""
        recording = Recording(
            session_id="session_123",
            participant_id="user_456",
        )

        recording.start()
        recording.stop()

        assert recording.status == RecordingStatus.STOPPED
        assert recording.ended_at is not None
        assert recording.is_active() is False

    def test_cannot_stop_not_recording(self):
        """Test that cannot stop a non-recording session"""
        recording = Recording(
            session_id="session_123",
            participant_id="user_456",
        )

        with pytest.raises(ValueError):
            recording.stop()

    def test_duration_calculation(self):
        """Test recording duration calculation"""
        recording = Recording(
            session_id="session_123",
            participant_id="user_456",
        )

        recording.start()
        recording.stop()

        duration = recording.duration_seconds()
        assert duration >= 0


class TestRecordingRepository:
    """Test In-Memory Recording Repository"""

    @pytest.mark.asyncio
    async def test_save_and_find_recording(self, recording_repository):
        """Test saving and retrieving a recording"""
        recording = Recording(
            session_id="session_123",
            participant_id="user_456",
        )

        saved = await recording_repository.save(recording)
        found = await recording_repository.find_by_id(recording.recording_id)

        assert found is not None
        assert found.recording_id == saved.recording_id
        assert found.session_id == "session_123"

    @pytest.mark.asyncio
    async def test_find_by_session_id(self, recording_repository):
        """Test finding recordings by session ID"""
        recording1 = Recording(session_id="session_123", participant_id="user_1")
        recording2 = Recording(session_id="session_123", participant_id="user_2")
        recording3 = Recording(session_id="session_456", participant_id="user_3")

        await recording_repository.save(recording1)
        await recording_repository.save(recording2)
        await recording_repository.save(recording3)

        results = await recording_repository.find_by_session_id("session_123")

        assert len(results) == 2
        assert all(r.session_id == "session_123" for r in results)

    @pytest.mark.asyncio
    async def test_delete_recording(self, recording_repository):
        """Test deleting a recording"""
        recording = Recording(session_id="session_123", participant_id="user_456")

        await recording_repository.save(recording)
        deleted = await recording_repository.delete(recording.recording_id)

        assert deleted is True

        found = await recording_repository.find_by_id(recording.recording_id)
        assert found is None


class TestRecordingService:
    """Test Recording Service application logic"""

    @pytest.mark.asyncio
    async def test_start_recording_service(self, recording_service, event_publisher):
        """Test starting a recording through the service"""
        recording = await recording_service.start_recording(
            session_id="session_123",
            participant_id="user_456",
            media_type="audio",
        )

        assert recording is not None
        assert recording.status == RecordingStatus.RECORDING
        assert len(event_publisher.published_events) == 1

        event, routing_key = event_publisher.published_events[0]
        assert event.event_type == "recording.started"
        assert routing_key == "recording.started"

    @pytest.mark.asyncio
    async def test_stop_recording_service(
        self, recording_service, event_publisher
    ):
        """Test stopping a recording through the service"""
        # Start recording first
        recording = await recording_service.start_recording(
            session_id="session_123",
            participant_id="user_456",
        )

        # Stop recording
        stopped = await recording_service.stop_recording(recording.recording_id)

        assert stopped.status == RecordingStatus.STOPPED
        assert len(event_publisher.published_events) == 2

        # Check stop event
        event, routing_key = event_publisher.published_events[1]
        assert event.event_type == "recording.ended"

    @pytest.mark.asyncio
    async def test_get_recording_status(self, recording_service):
        """Test getting recording status"""
        recording = await recording_service.start_recording(
            session_id="session_123",
            participant_id="user_456",
        )

        status = await recording_service.get_recording_status(recording.recording_id)

        assert status["recording_id"] == str(recording.recording_id)
        assert status["status"] == "recording"
        assert status["session_id"] == "session_123"
        assert "duration_seconds" in status

    @pytest.mark.asyncio
    async def test_get_recordings_by_session(self, recording_service):
        """Test getting all recordings for a session"""
        await recording_service.start_recording(
            session_id="session_123",
            participant_id="user_1",
        )
        await recording_service.start_recording(
            session_id="session_123",
            participant_id="user_2",
        )

        recordings = await recording_service.get_recordings_by_session("session_123")

        assert len(recordings) == 2
        assert all(r.session_id == "session_123" for r in recordings)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
