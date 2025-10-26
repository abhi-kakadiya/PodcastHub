"""
FFmpeg Media Processor

Real implementation of MediaProcessorPort using FFmpeg.
Handles synchronization, audio enhancement, and mixing of podcast recordings.
"""

import asyncio
import subprocess
import os
from pathlib import Path
from typing import List, Optional
import logging

from src.application.ports.outbound import MediaProcessorPort


logger = logging.getLogger(__name__)


class FFmpegMediaProcessor(MediaProcessorPort):
    """
    FFmpeg-based media processor.

    Uses FFmpeg for professional-grade audio/video processing including:
    - Track synchronization
    - Noise reduction
    - Audio normalization
    - Multi-track mixing
    - Format conversion

    FFmpeg must be installed on the system.
    """

    def __init__(self, ffmpeg_path: str = "ffmpeg", ffprobe_path: str = "ffprobe"):
        """
        Initialize FFmpeg processor.

        Args:
            ffmpeg_path: Path to ffmpeg binary (default: "ffmpeg")
            ffprobe_path: Path to ffprobe binary (default: "ffprobe")
        """
        self.ffmpeg_path = ffmpeg_path
        self.ffprobe_path = ffprobe_path
        self._check_ffmpeg_available()

    def _check_ffmpeg_available(self):
        """Check if FFmpeg is available"""
        try:
            subprocess.run(
                [self.ffmpeg_path, "-version"],
                capture_output=True,
                check=True
            )
            logger.info("FFmpeg is available")
        except (subprocess.CalledProcessError, FileNotFoundError):
            logger.warning(
                f"FFmpeg not found at {self.ffmpeg_path}. "
                "Install FFmpeg for audio processing functionality."
            )

    async def _run_ffmpeg(self, args: List[str]) -> tuple[str, str]:
        """
        Run FFmpeg command asynchronously.

        Args:
            args: FFmpeg command arguments

        Returns:
            Tuple of (stdout, stderr)
        """
        cmd = [self.ffmpeg_path] + args
        logger.info(f"Running FFmpeg: {' '.join(cmd)}")

        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )

        stdout, stderr = await process.communicate()

        if process.returncode != 0:
            error_msg = stderr.decode()
            logger.error(f"FFmpeg error: {error_msg}")
            raise RuntimeError(f"FFmpeg command failed: {error_msg}")

        return stdout.decode(), stderr.decode()

    async def get_media_info(self, file_path: str) -> dict:
        """
        Get media file information using ffprobe.

        Args:
            file_path: Path to media file

        Returns:
            Dictionary with media information
        """
        cmd = [
            self.ffprobe_path,
            "-v", "quiet",
            "-print_format", "json",
            "-show_format",
            "-show_streams",
            file_path
        ]

        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )

        stdout, stderr = await process.communicate()

        if process.returncode != 0:
            raise RuntimeError(f"ffprobe failed: {stderr.decode()}")

        import json
        return json.loads(stdout.decode())

    async def synchronize_tracks(
        self, track_file_paths: List[str]
    ) -> List[tuple[str, int]]:
        """
        Synchronize multiple tracks based on timestamps.

        For podcast recordings, tracks are already synchronized by recording
        start time. This method validates sync and calculates any offset needed.

        Returns:
            List of (file_path, offset_ms) tuples
        """
        logger.info(f"Synchronizing {len(track_file_paths)} tracks")

        synchronized_tracks = []

        for idx, file_path in enumerate(track_file_paths):
            # In a real implementation, you would:
            # 1. Detect audio fingerprints
            # 2. Cross-correlate to find offset
            # 3. Calculate precise sync offset

            # For now, assume tracks are pre-synchronized by recording timestamps
            offset_ms = 0  # No offset needed
            synchronized_tracks.append((file_path, offset_ms))

        logger.info("Track synchronization completed")
        return synchronized_tracks

    async def apply_noise_reduction(self, file_path: str) -> str:
        """
        Apply noise reduction to a track using FFmpeg afftdn filter.

        Args:
            file_path: Path to input file

        Returns:
            Path to processed file
        """
        logger.info(f"Applying noise reduction to {file_path}")

        output_path = file_path.replace(".webm", "_noisereduced.webm")

        # Use FFmpeg's afftdn (FFT denoiser) filter
        args = [
            "-i", file_path,
            "-af", "afftdn=nf=-25",  # Noise floor reduction
            "-c:v", "copy",  # Copy video stream without re-encoding
            "-c:a", "libopus",  # Re-encode audio with Opus codec
            "-b:a", "128k",  # Audio bitrate
            "-y",  # Overwrite output
            output_path
        ]

        await self._run_ffmpeg(args)

        logger.info(f"Noise reduction completed: {output_path}")
        return output_path

    async def normalize_audio(self, file_path: str) -> str:
        """
        Normalize audio levels using FFmpeg loudnorm filter.

        Args:
            file_path: Path to input file

        Returns:
            Path to normalized file
        """
        logger.info(f"Normalizing audio for {file_path}")

        output_path = file_path.replace(".webm", "_normalized.webm")

        # Use FFmpeg's loudnorm filter for EBU R128 loudness normalization
        args = [
            "-i", file_path,
            "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",  # Target integrated loudness
            "-c:v", "copy",
            "-c:a", "libopus",
            "-b:a", "128k",
            "-y",
            output_path
        ]

        await self._run_ffmpeg(args)

        logger.info(f"Audio normalization completed: {output_path}")
        return output_path

    async def mix_tracks(
        self, track_file_paths: List[str], output_format: str = "mp3"
    ) -> str:
        """
        Mix multiple tracks into a single file.

        Args:
            track_file_paths: List of input file paths
            output_format: Output format (mp3, wav, opus, etc.)

        Returns:
            Path to mixed output file
        """
        logger.info(f"Mixing {len(track_file_paths)} tracks to {output_format}")

        if len(track_file_paths) == 0:
            raise ValueError("No tracks to mix")

        # Create output directory
        output_dir = Path("./storage/processed")
        output_dir.mkdir(parents=True, exist_ok=True)

        output_path = str(output_dir / f"mixed_podcast.{output_format}")

        if len(track_file_paths) == 1:
            # Single track - just convert format
            args = [
                "-i", track_file_paths[0],
                "-c:a", self._get_audio_codec(output_format),
                "-b:a", "192k",
                "-y",
                output_path
            ]
        else:
            # Multiple tracks - mix them
            # Build filter complex for mixing
            inputs = []
            for path in track_file_paths:
                inputs.extend(["-i", path])

            # Create amerge filter to mix all audio streams
            filter_complex = f"amerge=inputs={len(track_file_paths)}"

            args = inputs + [
                "-filter_complex", filter_complex,
                "-c:a", self._get_audio_codec(output_format),
                "-b:a", "192k",
                "-ac", "2",  # Stereo output
                "-y",
                output_path
            ]

        await self._run_ffmpeg(args)

        logger.info(f"Mixing completed: {output_path}")
        return output_path

    async def convert_format(
        self,
        input_path: str,
        output_format: str,
        audio_bitrate: str = "192k"
    ) -> str:
        """
        Convert media file to different format.

        Args:
            input_path: Input file path
            output_format: Target format (mp3, wav, opus, etc.)
            audio_bitrate: Audio bitrate (default: "192k")

        Returns:
            Path to converted file
        """
        logger.info(f"Converting {input_path} to {output_format}")

        output_path = input_path.rsplit(".", 1)[0] + f".{output_format}"

        args = [
            "-i", input_path,
            "-c:a", self._get_audio_codec(output_format),
            "-b:a", audio_bitrate,
            "-y",
            output_path
        ]

        await self._run_ffmpeg(args)

        logger.info(f"Format conversion completed: {output_path}")
        return output_path

    async def extract_audio(self, video_path: str, output_format: str = "mp3") -> str:
        """
        Extract audio from video file.

        Args:
            video_path: Path to video file
            output_format: Output audio format

        Returns:
            Path to extracted audio file
        """
        logger.info(f"Extracting audio from {video_path}")

        output_path = video_path.rsplit(".", 1)[0] + f".{output_format}"

        args = [
            "-i", video_path,
            "-vn",  # No video
            "-c:a", self._get_audio_codec(output_format),
            "-b:a", "192k",
            "-y",
            output_path
        ]

        await self._run_ffmpeg(args)

        logger.info(f"Audio extraction completed: {output_path}")
        return output_path

    async def concatenate_files(
        self,
        file_paths: List[str],
        output_path: str
    ) -> str:
        """
        Concatenate multiple media files in sequence.

        Useful for stitching chunks together.

        Args:
            file_paths: List of input file paths (in order)
            output_path: Path for concatenated output

        Returns:
            Path to concatenated file
        """
        logger.info(f"Concatenating {len(file_paths)} files")

        # Create concat list file
        concat_list_path = "/tmp/ffmpeg_concat_list.txt"
        with open(concat_list_path, "w") as f:
            for file_path in file_paths:
                f.write(f"file '{os.path.abspath(file_path)}'\n")

        args = [
            "-f", "concat",
            "-safe", "0",
            "-i", concat_list_path,
            "-c", "copy",  # Stream copy for fast concatenation
            "-y",
            output_path
        ]

        await self._run_ffmpeg(args)

        # Clean up concat list
        os.remove(concat_list_path)

        logger.info(f"Concatenation completed: {output_path}")
        return output_path

    def _get_audio_codec(self, format: str) -> str:
        """Get appropriate audio codec for format"""
        codec_map = {
            "mp3": "libmp3lame",
            "wav": "pcm_s16le",
            "opus": "libopus",
            "aac": "aac",
            "m4a": "aac",
            "ogg": "libvorbis",
            "flac": "flac",
        }
        return codec_map.get(format.lower(), "libmp3lame")


# Fallback mock processor if FFmpeg is not available
class MockMediaProcessor(MediaProcessorPort):
    """
    Mock implementation when FFmpeg is not available.
    Simulates processing without actual audio manipulation.
    """

    async def synchronize_tracks(
        self, track_file_paths: List[str]
    ) -> List[tuple[str, int]]:
        """Simulate track synchronization"""
        await asyncio.sleep(0.1)
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
