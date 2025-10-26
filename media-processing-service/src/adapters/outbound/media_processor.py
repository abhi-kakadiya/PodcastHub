"""
Mock Media Processor

In a real implementation, this would use FFmpeg, Pydub, or similar libraries.
For Phase 2, we provide a mock implementation.
"""

import asyncio
from typing import List


class MockMediaProcessor:
    """
    Mock implementation of MediaProcessorPort.

    In production, this would use real audio/video processing libraries.
    """

    async def synchronize_tracks(
        self, track_file_paths: List[str]
    ) -> List[tuple[str, int]]:
        """Simulate track synchronization"""
        await asyncio.sleep(0.1)  # Simulate processing
        return [(path, idx * 100) for idx, path in enumerate(track_file_paths)]

    async def apply_noise_reduction(self, file_path: str) -> str:
        """Simulate noise reduction"""
        await asyncio.sleep(0.1)
        return file_path.replace(".webm", "_noisereduced.webm")

    async def normalize_audio(self, file_path: str) -> str:
        """Simulate audio normalization"""
        await asyncio.sleep(0.1)
        return file_path.replace(".webm", "_normalized.webm")

    async def mix_tracks(
        self, track_file_paths: List[str], output_format: str = "mp3"
    ) -> str:
        """Simulate track mixing"""
        await asyncio.sleep(0.2)
        return f"output/mixed_podcast.{output_format}"
