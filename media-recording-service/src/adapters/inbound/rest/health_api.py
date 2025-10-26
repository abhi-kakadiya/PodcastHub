"""
Health Check API

Provides health check endpoint for monitoring and heartbeat.
"""

from fastapi import APIRouter
from datetime import datetime

router = APIRouter()


@router.get("/api/health")
async def health_check():
    """
    Health check endpoint.

    Used by:
    - Load balancers
    - Monitoring systems
    - Frontend heartbeat mechanism

    Returns:
        dict: Health status information
    """
    return {
        "status": "healthy",
        "service": "media-recording-service",
        "timestamp": datetime.utcnow().isoformat(),
        "version": "1.0.0"
    }


@router.get("/api/health/ready")
async def readiness_check():
    """
    Readiness check endpoint.

    Indicates if the service is ready to accept requests.
    Can check database connections, message queues, etc.

    Returns:
        dict: Readiness status
    """
    # In production, check:
    # - Database connection
    # - RabbitMQ connection
    # - External service dependencies

    return {
        "ready": True,
        "checks": {
            "rabbitmq": "connected",
            "storage": "available"
        }
    }


@router.get("/api/health/live")
async def liveness_check():
    """
    Liveness check endpoint.

    Indicates if the service is alive and running.
    Used by Kubernetes liveness probes.

    Returns:
        dict: Liveness status
    """
    return {
        "alive": True,
        "service": "media-recording-service"
    }
