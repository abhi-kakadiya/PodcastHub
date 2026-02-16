"""
WebSocket Handler for WebRTC Signaling
Handles peer-to-peer connection signaling between host and guests
"""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Dict, List
import logging
import json

router = APIRouter()
logger = logging.getLogger(__name__)

# Store active WebSocket connections per session
# session_id -> list of WebSocket connections
active_connections: Dict[str, List[WebSocket]] = {}

# Store participant info
# session_id -> list of {websocket, participant_id, role}
session_participants: Dict[str, List[Dict]] = {}

# Track the current screen sharer per session
# session_id -> participant_id
session_screen_sharer: Dict[str, str] = {}


@router.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    """
    WebSocket endpoint for WebRTC signaling

    Handles:
    - Offer/Answer exchange (SDP)
    - ICE candidate exchange
    - Participant join/leave notifications
    - Screen share notifications
    """
    await websocket.accept()
    logger.info(f"WebSocket connection accepted for session: {session_id}")

    # Initialize session if not exists
    if session_id not in active_connections:
        active_connections[session_id] = []
        session_participants[session_id] = []

    # Add connection to session
    active_connections[session_id].append(websocket)

    participant_info = None

    try:
        while True:
            # Receive message from client
            data = await websocket.receive_text()
            message = json.loads(data)

            message_type = message.get("type")
            participant_id = message.get("participantId")

            logger.info(f"Received {message_type} from {participant_id} in session {session_id}")

            # Handle different message types
            if message_type == "join":
                # Participant joining session
                is_host = message.get("isHost", False)
                participant_info = {
                    "websocket": websocket,
                    "participantId": participant_id,
                    "role": "host" if is_host else "guest",
                }
                session_participants[session_id].append(participant_info)

                # Sync current screen-share owner for late joiners.
                active_sharer = session_screen_sharer.get(session_id)
                if active_sharer:
                    try:
                        await websocket.send_text(
                            json.dumps(
                                {
                                    "type": "screen-share-started",
                                    "participantId": active_sharer,
                                }
                            )
                        )
                    except Exception as exc:
                        logger.error(
                            "Failed to sync screen-share state to %s in session %s: %s",
                            participant_id,
                            session_id,
                            exc,
                        )

                # Notify other participants
                await broadcast_to_session(
                    session_id,
                    {
                        "type": "participant-joined",
                        "participantId": participant_id,
                        "role": participant_info["role"],
                    },
                    exclude=websocket,
                )

                logger.info(f"{participant_id} joined session {session_id} as {participant_info['role']}")

            elif message_type == "offer":
                # WebRTC offer from host to guest
                await broadcast_to_session(
                    session_id,
                    {
                        "type": "offer",
                        "offer": message.get("offer"),
                        "participantId": participant_id,
                    },
                    exclude=websocket,
                )

            elif message_type == "answer":
                # WebRTC answer from guest to host
                await broadcast_to_session(
                    session_id,
                    {
                        "type": "answer",
                        "answer": message.get("answer"),
                        "participantId": participant_id,
                    },
                    exclude=websocket,
                )

            elif message_type == "ice-candidate":
                # ICE candidate exchange
                await broadcast_to_session(
                    session_id,
                    {
                        "type": "ice-candidate",
                        "candidate": message.get("candidate"),
                        "participantId": participant_id,
                    },
                    exclude=websocket,
                )

            elif message_type == "screen-share-started":
                if not participant_id:
                    logger.warning(
                        "Ignoring screen-share-started without participantId in session %s",
                        session_id,
                    )
                    continue

                active_sharer = session_screen_sharer.get(session_id)
                if active_sharer and active_sharer != participant_id:
                    logger.info(
                        "Screen-share denied for %s in session %s; active sharer is %s",
                        participant_id,
                        session_id,
                        active_sharer,
                    )
                    try:
                        await websocket.send_text(
                            json.dumps(
                                {
                                    "type": "screen-share-denied",
                                    "participantId": participant_id,
                                    "activeParticipantId": active_sharer,
                                    "reason": "Another participant is already sharing their screen.",
                                }
                            )
                        )
                    except Exception as exc:
                        logger.error(
                            "Failed to send screen-share denial to %s in session %s: %s",
                            participant_id,
                            session_id,
                            exc,
                        )
                    continue

                session_screen_sharer[session_id] = participant_id

                # Broadcast authoritative current screen-share owner to everyone.
                await broadcast_to_session(
                    session_id,
                    {
                        "type": "screen-share-started",
                        "participantId": participant_id,
                    },
                )

            elif message_type == "screen-share-stopped":
                if not participant_id:
                    logger.warning(
                        "Ignoring screen-share-stopped without participantId in session %s",
                        session_id,
                    )
                    continue

                active_sharer = session_screen_sharer.get(session_id)
                if active_sharer and active_sharer != participant_id:
                    logger.warning(
                        "Ignoring screen-share stop from %s in session %s; active sharer is %s",
                        participant_id,
                        session_id,
                        active_sharer,
                    )
                    continue

                if active_sharer == participant_id:
                    del session_screen_sharer[session_id]

                await broadcast_to_session(
                    session_id,
                    {
                        "type": "screen-share-stopped",
                        "participantId": participant_id,
                    },
                )

            elif message_type == "ping":
                logger.debug(
                    "Received ping from %s in session %s", participant_id, session_id
                )
                await broadcast_to_session(
                    session_id,
                    {
                        "type": "pong",
                        "participantId": participant_id,
                        "sessionId": session_id,
                        "timestamp": message.get("timestamp"),
                    },
                )

            elif message_type == "recording-control":
                logger.info(
                    "Broadcasting recording control '%s' from %s in session %s",
                    message.get("action"),
                    participant_id,
                    session_id,
                )
                payload = {
                    "type": "recording-control",
                    "action": message.get("action"),
                    "initiatedBy": message.get("initiatedBy", participant_id),
                    "participantId": participant_id,
                    "sessionId": session_id,
                    "timestamp": message.get("timestamp"),
                }
                await broadcast_to_session(session_id, payload, exclude=websocket)

            else:
                logger.warning(f"Unknown message type: {message_type}")

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for session: {session_id}")

    except Exception as e:
        logger.error(f"WebSocket error: {e}")

    finally:
        # Clean up connection
        if websocket in active_connections.get(session_id, []):
            active_connections[session_id].remove(websocket)

        # Remove participant info
        if participant_info:
            session_participants[session_id] = [
                p for p in session_participants[session_id]
                if p["websocket"] != websocket
            ]

            if session_screen_sharer.get(session_id) == participant_info["participantId"]:
                del session_screen_sharer[session_id]
                await broadcast_to_session(
                    session_id,
                    {
                        "type": "screen-share-stopped",
                        "participantId": participant_info["participantId"],
                    },
                    exclude=websocket,
                )

            # Notify others that participant left
            await broadcast_to_session(
                session_id,
                {
                    "type": "participant-left",
                    "participantId": participant_info["participantId"],
                },
                exclude=websocket,
            )

        # Clean up empty sessions
        if not active_connections.get(session_id):
            del active_connections[session_id]
            if session_id in session_participants:
                del session_participants[session_id]
            if session_id in session_screen_sharer:
                del session_screen_sharer[session_id]

        logger.info(f"Cleaned up connection for session: {session_id}")


async def broadcast_to_session(session_id: str, message: dict, exclude: WebSocket = None):
    """
    Broadcast message to all participants in a session

    Args:
        session_id: Session ID
        message: Message to broadcast
        exclude: WebSocket to exclude from broadcast (usually sender)
    """
    if session_id not in active_connections:
        return

    message_str = json.dumps(message)

    for connection in active_connections[session_id]:
        if connection != exclude:
            try:
                await connection.send_text(message_str)
            except Exception as e:
                logger.error(f"Error broadcasting to connection: {e}")


@router.get("/ws/sessions/active")
async def get_active_sessions():
    """
    Get list of active sessions with participant counts

    For debugging/monitoring
    """
    sessions = []
    for session_id, participants in session_participants.items():
        sessions.append({
            "session_id": session_id,
            "participant_count": len(participants),
            "participants": [
                {
                    "participantId": p["participantId"],
                    "role": p["role"],
                }
                for p in participants
            ],
        })

    return {
        "total_sessions": len(sessions),
        "sessions": sessions,
    }
