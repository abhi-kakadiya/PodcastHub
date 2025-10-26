"""
REST API Inbound Adapter

Exposes the application's use cases via HTTP/REST API using FastAPI.
"""

from .recording_api import router as recording_router
from .upload_api import router as upload_router

__all__ = ["recording_router", "upload_router"]
