"""
Event Publisher Port (Outbound)
"""

from abc import ABC, abstractmethod

from src.domain.events.base import DomainEvent


class EventPublisherPort(ABC):
    """Outbound port for publishing domain events"""

    @abstractmethod
    async def publish(self, event: DomainEvent, routing_key: str = "") -> None:
        """Publish a domain event"""
        pass

    @abstractmethod
    async def publish_batch(self, events: list[DomainEvent]) -> None:
        """Publish multiple events"""
        pass
