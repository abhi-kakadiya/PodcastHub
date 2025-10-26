"""
Upload Service Port (Inbound)

Defines the contract for upload-related use cases.
"""

from abc import ABC, abstractmethod
from typing import Optional
from uuid import UUID

from src.domain.models import Chunk, Upload


class UploadServicePort(ABC):
    """
    Inbound port for upload operations.

    Defines use cases for chunk upload management.
    """

    @abstractmethod
    async def initiate_upload(
        self,
        recording_id: UUID,
        session_id: str,
        file_name: str,
        mime_type: str,
        total_chunks: int,
    ) -> Upload:
        """
        Initiate a new upload session.

        Args:
            recording_id: ID of the recording
            session_id: Session ID
            file_name: Name of the file being uploaded
            mime_type: MIME type of the file
            total_chunks: Expected number of chunks

        Returns:
            Upload: The created upload session
        """
        pass

    @abstractmethod
    async def upload_chunk(
        self,
        upload_id: UUID,
        sequence_number: int,
        chunk_data: bytes,
        checksum: str,
    ) -> Chunk:
        """
        Upload a single chunk.

        Args:
            upload_id: ID of the upload session
            sequence_number: Sequence number of the chunk
            chunk_data: The actual chunk data
            checksum: Checksum for validation

        Returns:
            Chunk: The uploaded chunk

        Raises:
            UploadNotFoundException: If upload not found
            ChunkValidationException: If checksum validation fails
        """
        pass

    @abstractmethod
    async def retry_chunk(self, chunk_id: UUID) -> Chunk:
        """
        Retry uploading a failed chunk.

        Args:
            chunk_id: ID of the chunk to retry

        Returns:
            Chunk: The chunk with updated status

        Raises:
            ChunkNotFoundException: If chunk not found
            ChunkValidationException: If chunk cannot be retried
        """
        pass

    @abstractmethod
    async def get_upload_progress(self, upload_id: UUID) -> dict:
        """
        Get upload progress information.

        Args:
            upload_id: ID of the upload session

        Returns:
            Dictionary with progress information

        Raises:
            UploadNotFoundException: If upload not found
        """
        pass

    @abstractmethod
    async def get_upload(self, upload_id: UUID) -> Optional[Upload]:
        """
        Get an upload by ID.

        Args:
            upload_id: ID of the upload

        Returns:
            Upload or None if not found
        """
        pass
