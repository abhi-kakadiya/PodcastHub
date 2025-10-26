"""
Messaging Adapters

Implements event publishing using RabbitMQ.
"""

from .rabbitmq_publisher import RabbitMQEventPublisher

__all__ = ["RabbitMQEventPublisher"]
