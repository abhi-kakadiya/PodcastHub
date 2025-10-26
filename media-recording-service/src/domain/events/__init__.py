"""
Domain Events

Events that represent state changes in the domain.
These events are published to RabbitMQ for event-driven communication.
"""

from .base import DomainEvent
from .recording_events import RecordingStarted, RecordingEnded, RecordingFailed
from .chunk_events import ChunkCaptured, ChunkUploaded, ChunkFailed
from .upload_events import UploadStarted, UploadCompleted, UploadFailed

__all__ = [
    "DomainEvent",
    "RecordingStarted",
    "RecordingEnded",
    "RecordingFailed",
    "ChunkCaptured",
    "ChunkUploaded",
    "ChunkFailed",
    "UploadStarted",
    "UploadCompleted",
    "UploadFailed",
]
