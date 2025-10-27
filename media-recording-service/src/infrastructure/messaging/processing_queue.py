"""
Media Processing Queue Helpers

Provides a lightweight RabbitMQ publisher for scheduling background
media processing jobs (e.g., FFmpeg stitching of uploaded chunks).
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Optional

import aio_pika

logger = logging.getLogger(__name__)


class ProcessingCommandPublisher:
    """Publish processing commands to a RabbitMQ queue."""

    def __init__(self, rabbitmq_url: str, queue_name: str = "media.processing.requests"):
        self._rabbitmq_url = rabbitmq_url
        self.queue_name = queue_name
        self._connection: Optional[aio_pika.RobustConnection] = None
        self._channel: Optional[aio_pika.Channel] = None
        self._queue: Optional[aio_pika.Queue] = None
        self._lock = asyncio.Lock()

    async def connect(self) -> None:
        """Ensure the RabbitMQ connection is established."""
        async with self._lock:
            if self._connection and not self._connection.is_closed:
                return

            self._connection = await aio_pika.connect_robust(self._rabbitmq_url)
            self._channel = await self._connection.channel()
            self._queue = await self._channel.declare_queue(
                self.queue_name,
                durable=True,
            )
            logger.info("Processing command publisher connected to queue %s", self.queue_name)

    async def publish(self, payload: dict) -> None:
        """Publish a processing job payload to the queue."""
        if not self._channel or not self._queue:
            await self.connect()

        assert self._channel is not None
        assert self._queue is not None

        message = aio_pika.Message(
            body=json.dumps(payload).encode("utf-8"),
            content_type="application/json",
        )

        await self._channel.default_exchange.publish(
            message,
            routing_key=self._queue.name,
        )
        logger.info(
            "Enqueued processing job for recording %s",
            payload.get("recording_id", "<unknown>"),
        )

    async def close(self) -> None:
        """Close the RabbitMQ connection."""
        if self._connection and not self._connection.is_closed:
            await self._connection.close()
            logger.info("Processing command publisher disconnected")
            self._connection = None
            self._channel = None
            self._queue = None
