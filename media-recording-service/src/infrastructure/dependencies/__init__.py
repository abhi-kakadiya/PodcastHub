"""
Dependency Injection Container

Manages application dependencies following the Dependency Inversion Principle.
This is where we wire up the concrete implementations to the ports.
"""

from typing import Optional

from src.application.ports.inbound import RecordingServicePort, UploadServicePort
from src.application.services import RecordingService, UploadService
from src.adapters.outbound.repository import (
    InMemoryRecordingRepository,
    InMemoryChunkRepository,
    InMemoryUploadRepository,
)
from src.adapters.outbound.messaging import RabbitMQEventPublisher
from src.adapters.outbound.storage import FileStorage
from src.infrastructure.config import get_settings


# Global singletons (in production, use a proper DI container)
_recording_repository: Optional[InMemoryRecordingRepository] = None
_chunk_repository: Optional[InMemoryChunkRepository] = None
_upload_repository: Optional[InMemoryUploadRepository] = None
_event_publisher: Optional[RabbitMQEventPublisher] = None
_storage: Optional[FileStorage] = None
_recording_service: Optional[RecordingService] = None
_upload_service: Optional[UploadService] = None


def get_recording_repository() -> InMemoryRecordingRepository:
    """Get or create recording repository instance"""
    global _recording_repository
    if _recording_repository is None:
        _recording_repository = InMemoryRecordingRepository()
    return _recording_repository


def get_chunk_repository() -> InMemoryChunkRepository:
    """Get or create chunk repository instance"""
    global _chunk_repository
    if _chunk_repository is None:
        _chunk_repository = InMemoryChunkRepository()
    return _chunk_repository


def get_upload_repository() -> InMemoryUploadRepository:
    """Get or create upload repository instance"""
    global _upload_repository
    if _upload_repository is None:
        _upload_repository = InMemoryUploadRepository()
    return _upload_repository


def get_event_publisher() -> RabbitMQEventPublisher:
    """Get or create event publisher instance"""
    global _event_publisher
    if _event_publisher is None:
        settings = get_settings()
        _event_publisher = RabbitMQEventPublisher(
            rabbitmq_url=settings.rabbitmq_url,
            exchange_name=settings.rabbitmq_exchange,
        )
    return _event_publisher


def get_storage() -> FileStorage:
    """
    Get or create storage instance.

    Uses FileStorage for actual file-based chunk persistence.
    Chunks are stored in ./storage directory by default.
    """
    global _storage
    if _storage is None:
        settings = get_settings()
        # Use file-based storage for production-ready chunk persistence
        _storage = FileStorage(base_path="./storage")
    return _storage


def get_recording_service() -> RecordingServicePort:
    """
    Get or create recording service instance.

    This is where we wire up the service with its dependencies.
    Following the Dependency Inversion Principle, the service
    depends on abstractions (ports), not concretions.
    """
    global _recording_service
    if _recording_service is None:
        _recording_service = RecordingService(
            recording_repository=get_recording_repository(),
            upload_repository=get_upload_repository(),
            event_publisher=get_event_publisher(),
        )
    return _recording_service


def get_upload_service() -> UploadServicePort:
    """Get or create upload service instance"""
    global _upload_service
    if _upload_service is None:
        _upload_service = UploadService(
            upload_repository=get_upload_repository(),
            chunk_repository=get_chunk_repository(),
            recording_repository=get_recording_repository(),
            event_publisher=get_event_publisher(),
            storage=get_storage(),
        )
    return _upload_service


async def initialize_dependencies():
    """
    Initialize all dependencies.

    This should be called during application startup.
    """
    # Initialize RabbitMQ connection
    event_publisher = get_event_publisher()
    try:
        await event_publisher.connect()
    except Exception as e:
        print(f"Warning: Failed to connect to RabbitMQ: {e}")
        print("Service will continue but events won't be published")


async def cleanup_dependencies():
    """
    Cleanup all dependencies.

    This should be called during application shutdown.
    """
    global _event_publisher

    # Disconnect from RabbitMQ
    if _event_publisher:
        await _event_publisher.disconnect()
