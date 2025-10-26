"""
RabbitMQ Event Publisher - Same as Recording Service
"""

import json
import logging
from typing import Optional

import aio_pika
from aio_pika import Connection, Channel, Exchange, Message

from src.application.ports.outbound import EventPublisherPort
from src.domain.events.base import DomainEvent


logger = logging.getLogger(__name__)


class RabbitMQEventPublisher(EventPublisherPort):
    """RabbitMQ implementation of EventPublisherPort"""

    def __init__(self, rabbitmq_url: str, exchange_name: str = "podcast_events"):
        self._rabbitmq_url = rabbitmq_url
        self._exchange_name = exchange_name
        self._connection: Optional[Connection] = None
        self._channel: Optional[Channel] = None
        self._exchange: Optional[Exchange] = None

    async def connect(self) -> None:
        """Establish connection to RabbitMQ"""
        try:
            self._connection = await aio_pika.connect_robust(self._rabbitmq_url)
            self._channel = await self._connection.channel()
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
        """Close connection to RabbitMQ"""
        if self._connection and not self._connection.is_closed:
            await self._connection.close()
            logger.info("Disconnected from RabbitMQ")

    async def publish(self, event: DomainEvent, routing_key: str = "") -> None:
        """Publish a domain event"""
        if not self._exchange:
            logger.warning("RabbitMQ not connected, attempting to connect...")
            await self.connect()

        try:
            event_data = event.to_dict()
            message_body = json.dumps(event_data, default=str)
            message = Message(
                body=message_body.encode(),
                content_type="application/json",
                headers={
                    "event_type": event.event_type,
                    "event_id": str(event.event_id),
                    "version": event.version,
                },
            )

            if not routing_key:
                routing_key = event.event_type

            await self._exchange.publish(message, routing_key=routing_key)
            logger.info(f"Published event {event.event_type} with routing key {routing_key}")

        except Exception as e:
            logger.error(f"Failed to publish event {event.event_type}: {e}")
            raise

    async def publish_batch(self, events: list[DomainEvent]) -> None:
        """Publish multiple events"""
        for event in events:
            await self.publish(event, routing_key=event.event_type)
        logger.info(f"Published batch of {len(events)} events")
