"""
Upload Service (Application Layer)

Implements the upload use cases by orchestrating chunk uploads,
managing upload sessions, and ensuring data integrity.
"""

import hashlib
from typing import Optional
from uuid import UUID

from src.application.ports.inbound import UploadServicePort
from src.application.ports.outbound import (
    ChunkRepositoryPort,
    UploadRepositoryPort,
    RecordingRepositoryPort,
    EventPublisherPort,
    StoragePort,
)
from src.domain.models import Chunk, Upload, ChunkStatus, UploadStatus
from src.domain.events import (
    UploadStarted,
    UploadCompleted,
    UploadFailed,
    ChunkCaptured,
    ChunkUploaded,
    ChunkFailed,
)
from src.domain.exceptions import (
    UploadNotFoundException,
    ChunkNotFoundException,
    ChunkValidationException,
    RecordingNotFoundException,
)


class UploadService(UploadServicePort):
    """
    Upload service implementation.

    Handles the complex logic of chunked uploads with retry/resume capabilities.
    """

    def __init__(
        self,
        upload_repository: UploadRepositoryPort,
        chunk_repository: ChunkRepositoryPort,
        recording_repository: RecordingRepositoryPort,
        event_publisher: EventPublisherPort,
        storage: StoragePort,
    ):
        """Initialize the service with required dependencies"""
        self._upload_repository = upload_repository
        self._chunk_repository = chunk_repository
        self._recording_repository = recording_repository
        self._event_publisher = event_publisher
        self._storage = storage

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

        Business rules:
        - Recording must exist
        - Cannot have multiple active uploads for same recording
        """
        # Verify recording exists
        recording = await self._recording_repository.find_by_id(recording_id)
        if not recording:
            raise RecordingNotFoundException(f"Recording {recording_id} not found")

        # Check for existing upload
        existing_upload = await self._upload_repository.find_by_recording_id(recording_id)
        if existing_upload and existing_upload.is_in_progress():
            # Return existing upload instead of creating new one
            return existing_upload

        # Create new upload
        upload = Upload(
            recording_id=recording_id,
            session_id=session_id,
            file_name=file_name,
            mime_type=mime_type,
            total_chunks=total_chunks,
            status=UploadStatus.IN_PROGRESS,
        )

        # Persist upload
        upload = await self._upload_repository.save(upload)

        # Publish event
        event = UploadStarted(
            upload_id=upload.upload_id,
            recording_id=upload.recording_id,
            session_id=upload.session_id,
            file_name=upload.file_name,
        )
        await self._event_publisher.publish(event, routing_key="upload.started")

        return upload

    async def upload_chunk(
        self,
        upload_id: UUID,
        sequence_number: int,
        chunk_data: bytes,
        checksum: str,
    ) -> Chunk:
        """
        Upload a single chunk with validation.

        This implements the resilient upload pattern:
        1. Validate checksum
        2. Store chunk data
        3. Update chunk status
        4. Update upload progress
        5. Check for completion
        """
        # Retrieve upload
        upload = await self._upload_repository.find_by_id(upload_id)
        if not upload:
            raise UploadNotFoundException(f"Upload {upload_id} not found")

        # Calculate checksum for validation (SHA-256 to match frontend)
        calculated_checksum = hashlib.sha256(chunk_data).hexdigest()
        if calculated_checksum != checksum:
            raise ChunkValidationException(
                f"Checksum mismatch: expected {checksum}, got {calculated_checksum}"
            )

        # Create chunk
        chunk = Chunk(
            recording_id=upload.recording_id,
            sequence_number=sequence_number,
            data_size=len(chunk_data),
            checksum=checksum,
            status=ChunkStatus.PENDING,
        )

        try:
            # Mark as uploading
            chunk.mark_uploading()

            # Store chunk data
            storage_path = await self._storage.store_chunk(
                chunk_id=chunk.chunk_id,
                recording_id=upload.recording_id,
                data=chunk_data,
                metadata={
                    "sequence_number": sequence_number,
                    "upload_id": str(upload_id),
                },
            )

            # Mark as uploaded
            chunk.mark_uploaded()
            chunk.metadata["storage_path"] = storage_path

            # Persist chunk
            chunk = await self._chunk_repository.save(chunk)

            # Update upload progress
            upload.mark_chunk_uploaded(chunk.data_size)
            upload = await self._upload_repository.save(upload)

            # Publish chunk uploaded event
            event = ChunkUploaded(
                chunk_id=chunk.chunk_id,
                recording_id=upload.recording_id,
                upload_id=upload_id,
                sequence_number=sequence_number,
            )
            await self._event_publisher.publish(event, routing_key="chunk.uploaded")

            # Check if upload is complete
            if upload.is_completed():
                completion_event = UploadCompleted(
                    upload_id=upload.upload_id,
                    recording_id=upload.recording_id,
                    session_id=upload.session_id,
                    total_chunks=upload.total_chunks,
                    total_size_bytes=upload.total_size_bytes,
                    file_name=upload.file_name,
                )
                await self._event_publisher.publish(
                    completion_event,
                    routing_key="upload.completed"
                )

            return chunk

        except Exception as e:
            # Mark chunk as failed
            chunk.mark_failed()
            chunk.metadata["error"] = str(e)
            await self._chunk_repository.save(chunk)

            # Publish failure event
            fail_event = ChunkFailed(
                chunk_id=chunk.chunk_id,
                recording_id=upload.recording_id,
                reason=str(e),
                can_retry=chunk.can_retry(),
            )
            await self._event_publisher.publish(fail_event, routing_key="chunk.failed")

            raise

    async def retry_chunk(self, chunk_id: UUID) -> Chunk:
        """
        Retry uploading a failed chunk.

        Business rules:
        - Chunk must exist
        - Chunk must be in FAILED status
        - Chunk must not exceed max retries
        """
        chunk = await self._chunk_repository.find_by_id(chunk_id)
        if not chunk:
            raise ChunkNotFoundException(f"Chunk {chunk_id} not found")

        if not chunk.can_retry():
            raise ChunkValidationException(
                f"Chunk {chunk_id} cannot be retried (max retries reached)"
            )

        # Reset chunk status to pending for retry
        chunk.status = ChunkStatus.PENDING
        chunk = await self._chunk_repository.save(chunk)

        return chunk

    async def get_upload_progress(self, upload_id: UUID) -> dict:
        """Get detailed upload progress information"""
        upload = await self._upload_repository.find_by_id(upload_id)
        if not upload:
            raise UploadNotFoundException(f"Upload {upload_id} not found")

        # Get all chunks for this upload
        chunks = await self._chunk_repository.find_by_recording_id(upload.recording_id)

        uploaded_chunks_list = [c for c in chunks if c.is_uploaded()]
        failed_chunks_list = [c for c in chunks if c.status == ChunkStatus.FAILED]

        return {
            "upload_id": str(upload.upload_id),
            "recording_id": str(upload.recording_id),
            "status": upload.status.value,
            "progress_percentage": upload.progress_percentage(),
            "uploaded_chunks": upload.uploaded_chunks,
            "total_chunks": upload.total_chunks,
            "uploaded_size_bytes": upload.uploaded_size_bytes,
            "total_size_bytes": upload.total_size_bytes,
            "failed_chunks_count": len(failed_chunks_list),
            "can_resume": len(failed_chunks_list) > 0,
            "file_name": upload.file_name,
            "mime_type": upload.mime_type,
        }

    async def get_upload(self, upload_id: UUID) -> Optional[Upload]:
        """Get an upload by ID"""
        return await self._upload_repository.find_by_id(upload_id)
