"""
Media Processor Port (Outbound)

Defines interface for actual media processing operations
(synchronization, noise reduction, mixing).
"""

from abc import ABC, abstractmethod
from typing import List
from uuid import UUID


class MediaProcessorPort(ABC):
    """
    Outbound port for media processing operations.

    This abstracts the actual audio/video processing logic.
    In a real system, this would use libraries like FFmpeg, Pydub, etc.
    """

    @abstractmethod
    async def synchronize_tracks(
        self, track_file_paths: List[str]
    ) -> List[tuple[str, int]]:
        """
        Synchronize multiple tracks based on timestamps.

        Returns: List of (file_path, offset_ms) tuples
        """
        pass

    @abstractmethod
    async def apply_noise_reduction(self, file_path: str) -> str:
        """
        Apply noise reduction to a track.

        Returns: Path to processed file
        """
        pass

    @abstractmethod
    async def normalize_audio(self, file_path: str) -> str:
        """
        Normalize audio levels.

        Returns: Path to normalized file
        """
        pass

    @abstractmethod
    async def mix_tracks(
        self, track_file_paths: List[str], output_format: str = "mp3"
    ) -> str:
        """
        Mix multiple tracks into a single file.

        Returns: Path to mixed output file
        """
        pass
