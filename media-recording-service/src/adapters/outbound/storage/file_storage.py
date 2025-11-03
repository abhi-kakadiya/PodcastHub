"""
File-based Storage Adapter

Implements StoragePort using local filesystem storage.
This is suitable for development and can be replaced with S3/Azure Blob in production.
"""

import aiofiles
from pathlib import Path
from typing import Optional
from uuid import UUID
import asyncio
import json

from src.application.ports.outbound import StoragePort


class FileStorage(StoragePort):
    """
    File-based implementation of StoragePort.

    Stores chunks as individual files on the filesystem.
    Directory structure: storage/{recording_id}/chunks/{chunk_id}.webm

    In production, replace with:
    - AWS S3: boto3/aioboto3
    - Azure Blob Storage: azure-storage-blob
    - Google Cloud Storage: google-cloud-storage
    """

    def __init__(self, base_path: str = "./storage"):
        """
        Initialize file storage.

        Args:
            base_path: Base directory for file storage
        """
        self._base_path = Path(base_path)
        self._base_path.mkdir(parents=True, exist_ok=True)
        self._lock = asyncio.Lock()

        # Create subdirectories
        self._chunks_dir = self._base_path / "chunks"
        self._recordings_dir = self._base_path / "recordings"
        self._chunks_dir.mkdir(exist_ok=True)
        self._recordings_dir.mkdir(exist_ok=True)

    def _get_recording_dir(self, recording_id: UUID) -> Path:
        """Get directory for a specific recording"""
        recording_dir = self._recordings_dir / str(recording_id)
        recording_dir.mkdir(parents=True, exist_ok=True)
        return recording_dir

    def _get_chunk_path(self, chunk_id: UUID, recording_id: UUID) -> Path:
        """Get file path for a specific chunk"""
        recording_dir = self._get_recording_dir(recording_id)
        return recording_dir / f"{chunk_id}.webm"

    def _get_metadata_path(self, chunk_id: UUID, recording_id: UUID) -> Path:
        """Get metadata file path for a chunk"""
        recording_dir = self._get_recording_dir(recording_id)
        return recording_dir / f"{chunk_id}.json"

    async def store_chunk(
        self,
        chunk_id: UUID,
        recording_id: UUID,
        data: bytes,
        metadata: dict = None,
    ) -> str:
        """
        Store a chunk of data to filesystem.

        Returns:
            Storage path where the chunk is stored
        """
        async with self._lock:
            chunk_path = self._get_chunk_path(chunk_id, recording_id)

            # Write chunk data
            async with aiofiles.open(chunk_path, 'wb') as f:
                await f.write(data)

            # Write metadata
            if metadata:
                metadata_path = self._get_metadata_path(chunk_id, recording_id)
                metadata_with_size = {
                    **metadata,
                    "size_bytes": len(data),
                    "chunk_id": str(chunk_id),
                    "recording_id": str(recording_id),
                }

                async with aiofiles.open(metadata_path, 'w') as f:
                    await f.write(json.dumps(metadata_with_size, indent=2))

            storage_path = f"file://{chunk_path}"
            return storage_path

    async def retrieve_chunk(self, chunk_id: UUID, recording_id: UUID = None) -> Optional[bytes]:
        """
        Retrieve a chunk by ID.

        Args:
            chunk_id: ID of the chunk to retrieve
            recording_id: Optional recording ID to speed up lookup

        Returns:
            bytes: The chunk data or None if not found
        """
        if recording_id:
            chunk_path = self._get_chunk_path(chunk_id, recording_id)
            if chunk_path.exists():
                async with aiofiles.open(chunk_path, 'rb') as f:
                    return await f.read()

        # If recording_id not provided or file not found, search all recordings
        for recording_dir in self._recordings_dir.iterdir():
            if recording_dir.is_dir():
                chunk_path = recording_dir / f"{chunk_id}.webm"
                if chunk_path.exists():
                    async with aiofiles.open(chunk_path, 'rb') as f:
                        return await f.read()

        return None

    async def delete_chunk(self, chunk_id: UUID, recording_id: UUID = None) -> bool:
        """Delete a chunk"""
        async with self._lock:
            if recording_id:
                chunk_path = self._get_chunk_path(chunk_id, recording_id)
                metadata_path = self._get_metadata_path(chunk_id, recording_id)

                deleted = False
                if chunk_path.exists():
                    chunk_path.unlink()
                    deleted = True
                if metadata_path.exists():
                    metadata_path.unlink()

                return deleted

            # Search all recordings
            for recording_dir in self._recordings_dir.iterdir():
                if recording_dir.is_dir():
                    chunk_path = recording_dir / f"{chunk_id}.webm"
                    metadata_path = recording_dir / f"{chunk_id}.json"

                    if chunk_path.exists():
                        chunk_path.unlink()
                        if metadata_path.exists():
                            metadata_path.unlink()
                        return True

            return False

    async def get_storage_path(self, recording_id: UUID) -> str:
        """Get the storage path for a recording"""
        recording_dir = self._get_recording_dir(recording_id)
        return f"file://{recording_dir}"

    async def cleanup_recording(self, recording_id: UUID) -> bool:
        """Clean up all chunks for a recording"""
        async with self._lock:
            recording_dir = self._get_recording_dir(recording_id)

            if not recording_dir.exists():
                return False

            # Delete all files in recording directory
            for file in recording_dir.iterdir():
                if file.is_file():
                    file.unlink()

            # Remove directory
            recording_dir.rmdir()

            return True

    async def list_chunks(self, recording_id: UUID) -> list[dict]:
        """
        List all chunks for a recording with metadata.

        Returns:
            List of chunk metadata dictionaries
        """
        recording_dir = self._get_recording_dir(recording_id)

        if not recording_dir.exists():
            return []

        chunks = []
        for file in sorted(recording_dir.glob("*.webm")):
            chunk_id = file.stem  # Filename without extension
            metadata_path = recording_dir / f"{chunk_id}.json"

            metadata = {"chunk_id": chunk_id, "path": str(file)}

            if metadata_path.exists():
                async with aiofiles.open(metadata_path, 'r') as f:
                    content = await f.read()
                    stored_metadata = json.loads(content)
                    metadata.update(stored_metadata)

            chunks.append(metadata)

        return chunks

    async def get_recording_size(self, recording_id: UUID) -> int:
        """
        Get total size of all chunks for a recording.

        Returns:
            Total size in bytes
        """
        recording_dir = self._get_recording_dir(recording_id)

        if not recording_dir.exists():
            return 0

        total_size = 0
        for file in recording_dir.glob("*.webm"):
            total_size += file.stat().st_size

        return total_size

    async def assemble_chunks(self, recording_id: UUID, output_path: str) -> str:
        """
        Assemble all chunks for a recording into a single file.

        This concatenates chunks in sequence order.
        For audio/video with proper encoding, FFmpeg should be used instead.

        Args:
            recording_id: Recording ID
            output_path: Path for output file

        Returns:
            Path to assembled file
        """
        chunks = await self.list_chunks(recording_id)

        # Sort by sequence number
        sorted_chunks = sorted(
            chunks,
            key=lambda x: int(x.get('sequence_number', 0))
        )

        output_file = Path(output_path)
        output_file.parent.mkdir(parents=True, exist_ok=True)

        async with aiofiles.open(output_file, 'wb') as outfile:
            for chunk_meta in sorted_chunks:
                chunk_path = Path(chunk_meta['path'])
                async with aiofiles.open(chunk_path, 'rb') as infile:
                    data = await infile.read()
                    await outfile.write(data)

        return str(output_file)

    # Helper methods for testing and monitoring
    async def get_total_size(self) -> int:
        """Get total size of all stored data"""
        total = 0
        for recording_dir in self._recordings_dir.iterdir():
            if recording_dir.is_dir():
                for file in recording_dir.glob("*.webm"):
                    total += file.stat().st_size
        return total

    async def get_chunk_count(self) -> int:
        """Get total number of stored chunks"""
        count = 0
        for recording_dir in self._recordings_dir.iterdir():
            if recording_dir.is_dir():
                count += len(list(recording_dir.glob("*.webm")))
        return count

    async def clear_all(self) -> None:
        """Clear all stored data (for testing)"""
        async with self._lock:
            import shutil
            if self._recordings_dir.exists():
                shutil.rmtree(self._recordings_dir)
            self._recordings_dir.mkdir(parents=True, exist_ok=True)
