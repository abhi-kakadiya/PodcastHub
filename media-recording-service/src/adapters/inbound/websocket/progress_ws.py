"""
WebSocket handler for real-time progress updates.

Provides real-time updates to clients about recording and upload progress.
"""

import json
import logging
from typing import Dict, Set
from uuid import UUID

from fastapi import APIRouter, WebSocket, WebSocketDisconnect


logger = logging.getLogger(__name__)


class ConnectionManager:
    """
    Manages WebSocket connections.

    Allows multiple clients to subscribe to updates for specific recordings/uploads.
    """

    def __init__(self):
        # Map of resource_id -> set of websockets
        self.active_connections: Dict[str, Set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, resource_id: str):
        """Accept and register a websocket connection"""
        await websocket.accept()

        if resource_id not in self.active_connections:
            self.active_connections[resource_id] = set()

        self.active_connections[resource_id].add(websocket)
        logger.info(f"WebSocket connected for resource {resource_id}")

    def disconnect(self, websocket: WebSocket, resource_id: str):
        """Unregister a websocket connection"""
        if resource_id in self.active_connections:
            self.active_connections[resource_id].discard(websocket)

            if not self.active_connections[resource_id]:
                del self.active_connections[resource_id]

        logger.info(f"WebSocket disconnected for resource {resource_id}")

    async def send_update(self, resource_id: str, message: dict):
        """Send update to all connected clients for a resource"""
        if resource_id not in self.active_connections:
            return

        disconnected = set()

        for connection in self.active_connections[resource_id]:
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.error(f"Error sending message: {e}")
                disconnected.add(connection)

        # Clean up disconnected websockets
        for connection in disconnected:
            self.disconnect(connection, resource_id)

    async def broadcast(self, message: dict):
        """Broadcast message to all connected clients"""
        for resource_id in list(self.active_connections.keys()):
            await self.send_update(resource_id, message)


# Global connection manager
manager = ConnectionManager()


router = APIRouter(prefix="/ws", tags=["websocket"])


@router.websocket("/recording/{recording_id}")
async def recording_progress(websocket: WebSocket, recording_id: UUID):
    """
    WebSocket endpoint for real-time recording progress.

    Clients can connect to this endpoint to receive updates about
    recording status and upload progress.
    """
    resource_id = str(recording_id)
    await manager.connect(websocket, resource_id)

    try:
        # Send initial connection confirmation
        await websocket.send_json({
            "type": "connected",
            "resource_id": resource_id,
            "message": "Connected to recording updates",
        })

        # Keep connection alive and handle incoming messages
        while True:
            data = await websocket.receive_text()

            # Echo back for heartbeat/ping
            await websocket.send_json({
                "type": "pong",
                "data": data,
            })

    except WebSocketDisconnect:
        manager.disconnect(websocket, resource_id)
        logger.info(f"Client disconnected from recording {recording_id}")


@router.websocket("/upload/{upload_id}")
async def upload_progress(websocket: WebSocket, upload_id: UUID):
    """
    WebSocket endpoint for real-time upload progress.

    Clients can connect to this endpoint to receive updates about
    chunk uploads and overall progress.
    """
    resource_id = str(upload_id)
    await manager.connect(websocket, resource_id)

    try:
        # Send initial connection confirmation
        await websocket.send_json({
            "type": "connected",
            "resource_id": resource_id,
            "message": "Connected to upload updates",
        })

        # Keep connection alive
        while True:
            data = await websocket.receive_text()
            await websocket.send_json({
                "type": "pong",
                "data": data,
            })

    except WebSocketDisconnect:
        manager.disconnect(websocket, resource_id)
        logger.info(f"Client disconnected from upload {upload_id}")


# Helper function to send progress updates (called by application services)
async def send_progress_update(resource_id: str, update_type: str, data: dict):
    """
    Send a progress update to connected clients.

    This can be called from application services to push updates.
    """
    message = {
        "type": update_type,
        "resource_id": resource_id,
        "data": data,
    }
    await manager.send_update(resource_id, message)
