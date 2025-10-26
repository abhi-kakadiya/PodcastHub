"""
Recording Service Port (Inbound)

Defines the contract for recording-related use cases.
This is the primary interface that the REST API adapter will use.
"""

from abc import ABC, abstractmethod
from typing import List, Optional
from uuid import UUID

from src.domain.models import Recording


class RecordingServicePort(ABC):
    """
    Inbound port for recording operations.

    This interface defines all use cases related to recording management.
    It follows the Interface Segregation Principle and defines only
    the operations needed by the driving adapters (REST API, WebSocket).
    """

    @abstractmethod
    async def start_recording(
        self,
        session_id: str,
        participant_id: str,
        media_type: str = "audio",
    ) -> Recording:
        """
        Start a new recording session.

        Args:
            session_id: The session this recording belongs to
            participant_id: The participant creating the recording
            media_type: Type of media (audio, video, screen)

        Returns:
            Recording: The created recording

        Raises:
            InvalidRecordingStateException: If recording cannot be started
        """
        pass

    @abstractmethod
    async def stop_recording(self, recording_id: UUID) -> Recording:
        """
        Stop an active recording.

        Args:
            recording_id: ID of the recording to stop

        Returns:
            Recording: The stopped recording

        Raises:
            RecordingNotFoundException: If recording not found
            InvalidRecordingStateException: If recording cannot be stopped
        """
        pass

    @abstractmethod
    async def get_recording(self, recording_id: UUID) -> Optional[Recording]:
        """
        Get a recording by ID.

        Args:
            recording_id: ID of the recording

        Returns:
            Recording or None if not found
        """
        pass

    @abstractmethod
    async def get_recordings_by_session(self, session_id: str) -> List[Recording]:
        """
        Get all recordings for a session.

        Args:
            session_id: The session ID

        Returns:
            List of recordings for the session
        """
        pass

    @abstractmethod
    async def get_recording_status(self, recording_id: UUID) -> dict:
        """
        Get detailed status of a recording including upload progress.

        Args:
            recording_id: ID of the recording

        Returns:
            Dictionary with recording status and upload progress

        Raises:
            RecordingNotFoundException: If recording not found
        """
        pass
