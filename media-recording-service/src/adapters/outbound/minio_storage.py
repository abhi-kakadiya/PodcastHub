"""
MinIO Storage Adapter - Outbound Adapter for Object Storage
Implements the storage port for uploading chunks to MinIO (S3-compatible storage)
"""

from io import BytesIO
from typing import Optional
import logging
from datetime import timedelta

from minio import Minio
from minio.error import S3Error

logger = logging.getLogger(__name__)


class MinIOStorageAdapter:
    """
    Adapter for MinIO object storage operations
    Handles chunk uploads to S3-compatible storage
    """

    def __init__(
        self,
        endpoint: str,
        access_key: str,
        secret_key: str,
        secure: bool = False,
        bucket_name: str = "recordings",
    ):
        """
        Initialize MinIO client

        Args:
            endpoint: MinIO server endpoint (e.g., 'localhost:9000')
            access_key: MinIO access key
            secret_key: MinIO secret key
            secure: Use HTTPS (default: False for local development)
            bucket_name: Default bucket for recordings
        """
        self.client = Minio(
            endpoint=endpoint,
            access_key=access_key,
            secret_key=secret_key,
            secure=secure,
        )
        self.bucket_name = bucket_name
        self._ensure_bucket_exists()

    def _ensure_bucket_exists(self) -> None:
        """Create bucket if it doesn't exist"""
        try:
            if not self.client.bucket_exists(self.bucket_name):
                self.client.make_bucket(self.bucket_name)
                logger.info(f"Created MinIO bucket: {self.bucket_name}")
        except S3Error as e:
            logger.error(f"Error creating bucket: {e}")
            raise

    def upload_chunk(
        self,
        session_id: str,
        recording_id: str,
        track_type: str,
        sequence: int,
        chunk_data: bytes,
        content_type: str = "video/webm",
    ) -> str:
        """
        Upload a recording chunk to MinIO

        Args:
            session_id: Session identifier
            recording_id: Recording identifier
            track_type: Type of track (audio, video, screen)
            sequence: Chunk sequence number
            chunk_data: Binary chunk data
            content_type: MIME type of the chunk

        Returns:
            Object path in MinIO
        """
        # Create hierarchical path: sessions/{session_id}/recordings/{recording_id}/{track_type}/chunk_{sequence}.webm
        object_name = f"sessions/{session_id}/recordings/{recording_id}/{track_type}/chunk_{sequence:05d}.webm"

        try:
            self.client.put_object(
                bucket_name=self.bucket_name,
                object_name=object_name,
                data=BytesIO(chunk_data),
                length=len(chunk_data),
                content_type=content_type,
            )

            logger.info(f"Uploaded chunk to MinIO: {object_name} ({len(chunk_data)} bytes)")
            return object_name

        except S3Error as e:
            logger.error(f"Error uploading chunk to MinIO: {e}")
            raise

    def get_chunk(
        self,
        object_name: str,
    ) -> bytes:
        """
        Download a chunk from MinIO

        Args:
            object_name: Object path in MinIO

        Returns:
            Chunk data as bytes
        """
        try:
            response = self.client.get_object(
                bucket_name=self.bucket_name,
                object_name=object_name,
            )
            data = response.read()
            response.close()
            response.release_conn()
            return data

        except S3Error as e:
            logger.error(f"Error downloading chunk from MinIO: {e}")
            raise

    def get_presigned_url(
        self,
        object_name: str,
        expires: timedelta = timedelta(hours=1),
    ) -> str:
        """
        Get a pre-signed URL for direct download

        Args:
            object_name: Object path in MinIO
            expires: URL expiration time

        Returns:
            Pre-signed URL
        """
        try:
            url = self.client.presigned_get_object(
                bucket_name=self.bucket_name,
                object_name=object_name,
                expires=expires,
            )
            return url

        except S3Error as e:
            logger.error(f"Error generating presigned URL: {e}")
            raise

    def list_chunks(
        self,
        session_id: str,
        recording_id: str,
        track_type: str,
    ) -> list[str]:
        """
        List all chunks for a recording track

        Args:
            session_id: Session identifier
            recording_id: Recording identifier
            track_type: Type of track

        Returns:
            List of object names
        """
        prefix = f"sessions/{session_id}/recordings/{recording_id}/{track_type}/"

        try:
            objects = self.client.list_objects(
                bucket_name=self.bucket_name,
                prefix=prefix,
            )
            return [obj.object_name for obj in objects]

        except S3Error as e:
            logger.error(f"Error listing chunks: {e}")
            raise

    def delete_chunk(
        self,
        object_name: str,
    ) -> None:
        """
        Delete a chunk from MinIO

        Args:
            object_name: Object path in MinIO
        """
        try:
            self.client.remove_object(
                bucket_name=self.bucket_name,
                object_name=object_name,
            )
            logger.info(f"Deleted chunk from MinIO: {object_name}")

        except S3Error as e:
            logger.error(f"Error deleting chunk: {e}")
            raise

    def upload_processed_file(
        self,
        session_id: str,
        recording_id: str,
        file_data: bytes,
        file_name: str,
        content_type: str = "video/mp4",
    ) -> str:
        """
        Upload a processed/stitched file to MinIO

        Args:
            session_id: Session identifier
            recording_id: Recording identifier
            file_data: Binary file data
            file_name: Name of the file (e.g., 'final_audio.mp4')
            content_type: MIME type

        Returns:
            Object path in MinIO
        """
        object_name = f"sessions/{session_id}/recordings/{recording_id}/processed/{file_name}"

        try:
            self.client.put_object(
                bucket_name=self.bucket_name,
                object_name=object_name,
                data=BytesIO(file_data),
                length=len(file_data),
                content_type=content_type,
            )

            logger.info(f"Uploaded processed file to MinIO: {object_name} ({len(file_data)} bytes)")
            return object_name

        except S3Error as e:
            logger.error(f"Error uploading processed file: {e}")
            raise
