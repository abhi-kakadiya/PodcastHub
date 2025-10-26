"""
WebSocket Inbound Adapter

Provides real-time updates for recording and upload progress.
"""

from .progress_ws import router as websocket_router

__all__ = ["websocket_router"]
