"""
Dependency Injection for Processing Service
"""

from typing import Optional

from src.application.services.processing_service import ProcessingService
from src.adapters.outbound.repository.job_repository import InMemoryJobRepository
from src.adapters.outbound.messaging.rabbitmq_publisher import RabbitMQEventPublisher
from src.adapters.outbound.media_processor import MockMediaProcessor
from src.infrastructure.config.settings import get_settings


_job_repository: Optional[InMemoryJobRepository] = None
_event_publisher: Optional[RabbitMQEventPublisher] = None
_media_processor: Optional[MockMediaProcessor] = None
_processing_service: Optional[ProcessingService] = None


def get_job_repository() -> InMemoryJobRepository:
    global _job_repository
    if _job_repository is None:
        _job_repository = InMemoryJobRepository()
    return _job_repository


def get_event_publisher() -> RabbitMQEventPublisher:
    global _event_publisher
    if _event_publisher is None:
        settings = get_settings()
        _event_publisher = RabbitMQEventPublisher(
            rabbitmq_url=settings.rabbitmq_url,
            exchange_name=settings.rabbitmq_exchange,
        )
    return _event_publisher


def get_media_processor() -> MockMediaProcessor:
    global _media_processor
    if _media_processor is None:
        _media_processor = MockMediaProcessor()
    return _media_processor


def get_processing_service() -> ProcessingService:
    global _processing_service
    if _processing_service is None:
        _processing_service = ProcessingService(
            job_repository=get_job_repository(),
            event_publisher=get_event_publisher(),
            media_processor=get_media_processor(),
        )
    return _processing_service


async def initialize_dependencies():
    event_publisher = get_event_publisher()
    try:
        await event_publisher.connect()
    except Exception as e:
        print(f"Warning: Failed to connect to RabbitMQ: {e}")


async def cleanup_dependencies():
    global _event_publisher
    if _event_publisher:
        await _event_publisher.disconnect()
