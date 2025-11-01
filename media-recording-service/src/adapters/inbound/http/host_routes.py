"""
Host-centric HTTP routes.

Expose endpoints that allow a host to inspect completed sessions,
participants, and processed assets with download links.
"""

from __future__ import annotations

import logging
from collections import defaultdict
from typing import Any, Dict, List

from fastapi import APIRouter

from src.adapters.inbound.http.session_routes import sessions_db
from src.adapters.inbound.http.upload_routes import get_minio_client
from src.infrastructure.persistence import get_recording_metadata_store

router = APIRouter(prefix="/api/hosts", tags=["hosts"])
logger = logging.getLogger(__name__)


def _safe_url(minio_client, object_path: str | None) -> str | None:
    if not object_path:
        return None
    try:
        return minio_client.get_presigned_url(object_path)
    except Exception as exc:  # pragma: no cover - best effort
        logger.warning("Unable to generate presigned URL for %s: %s", object_path, exc)
        return None


def _derive_session_status(tracks: List[Dict[str, Any]]) -> str:
    """Return a high-level status badge for a session based on track metadata."""
    if not tracks:
        return "pending"

    processing_statuses = {
        (track.get("processing_status") or "").lower()
        for track in tracks
    }
    recording_states = {
        (track.get("status") or "").lower()
        for track in tracks
    }

    if {"failed", "error"} & (processing_statuses | recording_states):
        return "needs_attention"

    if tracks and all(status == "completed" for status in processing_statuses if status):
        return "complete"

    if {"queued", "processing", "pending"} & processing_statuses:
        return "processing"

    if {"recording", "waiting", "active"} & recording_states:
        return "processing"

    return "pending"


@router.get("/{host_id}/sessions")
async def list_host_sessions(host_id: str) -> Dict[str, Any]:
    """
    Return sessions recorded by the specified host, including participant tracks
    and presigned download URLs for processed assets.
    """
    metadata_store = get_recording_metadata_store()
    minio_client = get_minio_client()

    sessions = await metadata_store.list_sessions_for_participant(host_id)
    payload_sessions: List[Dict[str, Any]] = []

    for session_info in sessions:
        session_id = session_info["session_id"]
        detailed_recordings = await metadata_store.list_recordings_with_details(session_id)

        participants: Dict[str, List[Dict[str, Any]]] = {}
        all_tracks: List[Dict[str, Any]] = []

        for recording in detailed_recordings:
            processed_asset_path = recording["processed_asset_path"]
            processed_asset_url = _safe_url(minio_client, processed_asset_path)

            track_payload = {
                "recording_id": recording["recording_id"],
                "participant_id": recording["participant_id"],
                "track_type": recording["track_type"],
                "status": recording["status"],
                "processing_status": recording["processing_status"],
                "started_at": recording["started_at"],
                "ended_at": recording["ended_at"],
                "created_at": recording["created_at"],
                "updated_at": recording["updated_at"],
                "uploaded_chunks": recording["uploaded_chunks"],
                "total_chunks": recording["total_chunks"],
                "processed_asset_path": processed_asset_path,
                "processed_asset_url": processed_asset_url,
                "download_filename": (
                    processed_asset_path.rsplit("/", 1)[-1]
                    if processed_asset_path
                    else None
                ),
            }

            participant_tracks = participants.setdefault(recording["participant_id"], [])
            participant_tracks.append(track_payload)
            all_tracks.append(track_payload)

        participants_payload = [
            {
                "participant_id": participant_id,
                "tracks": sorted(
                    tracks,
                    key=lambda track: (track["track_type"], track["created_at"] or ""),
                ),
            }
            for participant_id, tracks in participants.items()
        ]

        session_record = sessions_db.get(session_id, {})

        tracks_by_type: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
        for track in all_tracks:
            tracks_by_type[track["track_type"]].append(track)

        grouped_tracks = [
            {
                "track_type": track_type,
                "total": len(track_list),
                "processed": sum(1 for track in track_list if track["processed_asset_url"]),
                "tracks": sorted(
                    track_list,
                    key=lambda track: (track["created_at"] or "", track["participant_id"]),
                ),
            }
            for track_type, track_list in sorted(tracks_by_type.items())
        ]

        session_status = _derive_session_status(all_tracks)

        payload_sessions.append(
            {
                "session_id": session_id,
                "room_code": session_record.get("room_code"),
                "host_id": session_record.get("host_id", host_id),
                "status": session_record.get("status") or session_status,
                "derived_status": session_status,
                "created_at": session_record.get("created_at"),
                "first_recorded_at": session_info.get("first_recorded_at"),
                "last_updated_at": session_info.get("last_updated_at"),
                "participants": participants_payload,
                "total_tracks": len(detailed_recordings),
                "track_summary": grouped_tracks,
                "processed_tracks": sum(1 for track in all_tracks if track["processed_asset_url"]),
            }
        )

    return {
        "host_id": host_id,
        "total_sessions": len(payload_sessions),
        "sessions": payload_sessions,
    }
