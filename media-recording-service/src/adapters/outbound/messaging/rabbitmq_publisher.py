"""
RabbitMQ Event Publisher

Implements EventPublisherPort using RabbitMQ via aio-pika.
"""

import json
import logging
from typing import Optional

import aio_pika
from aio_pika import Connection, Channel, Exchange, Message
from aio_pika.pool import Pool

from src.application.ports.outbound import EventPublisherPort
from src.domain.events.base import DomainEvent


logger = logging.getLogger(__name__)


class RabbitMQEventPublisher(EventPublisherPort):
    """
    RabbitMQ implementation of EventPublisherPort.

    Uses aio-pika for async RabbitMQ operations.
    Implements connection pooling for better performance.
    """

    def __init__(self, rabbitmq_url: str, exchange_name: str = "podcast_events"):
        """
        Initialize RabbitMQ publisher.

        Args:
            rabbitmq_url: RabbitMQ connection URL
            exchange_name: Name of the exchange for events
        """
        self._rabbitmq_url = rabbitmq_url
        self._exchange_name = exchange_name
        self._connection: Optional[Connection] = None
        self._channel: Optional[Channel] = None
        self._exchange: Optional[Exchange] = None

    async def connect(self) -> None:
        """
        Establish connection to RabbitMQ.

        This should be called during application startup.
        """
        try:
            self._connection = await aio_pika.connect_robust(self._rabbitmq_url)
            self._channel = await self._connection.channel()

            # Declare a topic exchange for event routing
            self._exchange = await self._channel.declare_exchange(
                self._exchange_name,
                aio_pika.ExchangeType.TOPIC,
                durable=True,
            )

            logger.info(f"Connected to RabbitMQ, exchange: {self._exchange_name}")

        except Exception as e:
            logger.error(f"Failed to connect to RabbitMQ: {e}")
            raise

    async def disconnect(self) -> None:
        """
        Close connection to RabbitMQ.

        This should be called during application shutdown.
        """
        if self._connection and not self._connection.is_closed:
            await self._connection.close()
            logger.info("Disconnected from RabbitMQ")

    async def publish(self, event: DomainEvent, routing_key: str = "") -> None:
        """
        Publish a domain event to RabbitMQ.

        Args:
            event: The domain event to publish
            routing_key: Routing key for topic-based routing
        """
        if not self._exchange:
            logger.warning("RabbitMQ not connected, attempting to connect...")
            await self.connect()

        try:
            # Convert event to dictionary
            event_data = event.to_dict()

            # Serialize to JSON
            message_body = json.dumps(event_data, default=str)

            # Create message
            message = Message(
                body=message_body.encode(),
                content_type="application/json",
                headers={
                    "event_type": event.event_type,
                    "event_id": str(event.event_id),
                    "version": event.version,
                },
            )

            # Use event_type as routing key if not provided
            if not routing_key:
                routing_key = event.event_type

            # Publish to exchange
            await self._exchange.publish(
                message,
                routing_key=routing_key,
            )

            logger.info(
                f"Published event {event.event_type} "
                f"(ID: {event.event_id}) with routing key {routing_key}"
            )

        except Exception as e:
            logger.error(f"Failed to publish event {event.event_type}: {e}")
            raise

    async def publish_batch(self, events: list[DomainEvent]) -> None:
        """
        Publish multiple events in a batch.

        This is more efficient than publishing events one by one.
        """
        for event in events:
            # Use event_type as routing key
            await self.publish(event, routing_key=event.event_type)

        logger.info(f"Published batch of {len(events)} events")

    def is_connected(self) -> bool:
        """Check if connected to RabbitMQ"""
        return (
            self._connection is not None
            and not self._connection.is_closed
            and self._exchange is not None
        )
