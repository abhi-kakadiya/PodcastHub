"""
Event Publisher Port (Outbound)

Defines the contract for publishing domain events.
"""

from abc import ABC, abstractmethod

from src.domain.events.base import DomainEvent


class EventPublisherPort(ABC):
    """
    Outbound port for publishing domain events.

    This interface is implemented by the RabbitMQ adapter,
    but could be replaced with other message brokers (Kafka, SNS, etc.)
    """

    @abstractmethod
    async def publish(self, event: DomainEvent, routing_key: str = "") -> None:
        """
        Publish a domain event.

        Args:
            event: The domain event to publish
            routing_key: Optional routing key for topic-based routing
        """
        pass

    @abstractmethod
    async def publish_batch(self, events: list[DomainEvent]) -> None:
        """
        Publish multiple events in a batch.

        Args:
            events: List of domain events to publish
        """
        pass
