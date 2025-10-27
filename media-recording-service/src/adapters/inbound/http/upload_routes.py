"""
Upload HTTP Routes - Simplified with MinIO Integration
Handles chunk uploads directly to MinIO storage
"""

from fastapi import APIRouter, HTTPException, File, UploadFile, Form
from pydantic import BaseModel
import hashlib
import logging
from datetime import datetime

router = APIRouter(prefix="/api/uploads", tags=["uploads"])
logger = logging.getLogger(__name__)

# Import MinIO adapter
from src.adapters.outbound.minio_storage import MinIOStorageAdapter
from src.infrastructure.config.settings import get_settings

# Global MinIO client (will be initialized on first use)
_minio_client = None


def get_minio_client() -> MinIOStorageAdapter:
    """Get or create MinIO client"""
    global _minio_client
    if _minio_client is None:
        settings = get_settings()
        _minio_client = MinIOStorageAdapter(
            endpoint=settings.minio_endpoint,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            secure=settings.minio_secure,
            bucket_name=settings.minio_bucket,
        )
    return _minio_client


# Import recordings database from recording_routes
from .recording_routes import recordings_db


class ChunkUploadResponse(BaseModel):
    chunk_id: str
    recording_id: str
    sequence: int
    size_bytes: int
    checksum: str
    minio_path: str
    uploaded_at: str


@router.post("/chunk", response_model=ChunkUploadResponse)
async def upload_chunk(
    recording_id: str = Form(...),
    sequence: int = Form(...),
    checksum: str = Form(...),
    chunk_file: UploadFile = File(...),
):
    """
    Upload a recording chunk to MinIO

    This endpoint:
    1. Receives chunk data from frontend
    2. Validates SHA-256 checksum
    3. Uploads to MinIO
    4. Updates recording metadata
    5. Returns upload confirmation
    """
    try:
        # Read chunk data
        chunk_data = await chunk_file.read()

        # Validate checksum (SHA-256)
        calculated_checksum = hashlib.sha256(chunk_data).hexdigest()
        if calculated_checksum != checksum:
            raise HTTPException(
                status_code=400,
                detail=f"Checksum mismatch: expected {checksum}, got {calculated_checksum}"
            )

        # Get recording metadata
        recording = recordings_db.get(recording_id)
        if not recording:
            raise HTTPException(
                status_code=404,
                detail=f"Recording {recording_id} not found"
            )

        # Get MinIO client
        minio_client = get_minio_client()

        # Upload to MinIO
        minio_path = minio_client.upload_chunk(
            session_id=recording["session_id"],
            recording_id=recording_id,
            track_type=recording["track_type"],
            sequence=sequence,
            chunk_data=chunk_data,
            content_type=chunk_file.content_type or "video/webm",
        )

        # Update recording metadata
        chunk_info = {
            "sequence": sequence,
            "size_bytes": len(chunk_data),
            "checksum": checksum,
            "minio_path": minio_path,
            "uploaded_at": datetime.utcnow().isoformat(),
        }

        recording["chunks"].append(chunk_info)
        recording["total_chunks"] = len(recording["chunks"])
        recording["uploaded_chunks"] = len(recording["chunks"])

        logger.info(
            f"✓ Uploaded chunk {sequence} for recording {recording_id} "
            f"({len(chunk_data)} bytes) to {minio_path}"
        )

        return ChunkUploadResponse(
            chunk_id=f"{recording_id}-{sequence}",
            recording_id=recording_id,
            sequence=sequence,
            size_bytes=len(chunk_data),
            checksum=checksum,
            minio_path=minio_path,
            uploaded_at=chunk_info["uploaded_at"],
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error uploading chunk: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to upload chunk: {str(e)}"
        )


@router.get("/recording/{recording_id}/progress")
async def get_upload_progress(recording_id: str):
    """
    Get upload progress for a recording

    Returns:
    - Total chunks expected
    - Chunks uploaded
    - Progress percentage
    - Chunk details
    """
    recording = recordings_db.get(recording_id)

    if not recording:
        raise HTTPException(
            status_code=404,
            detail=f"Recording {recording_id} not found"
        )

    total_chunks = recording.get("total_chunks", 0)
    uploaded_chunks = recording.get("uploaded_chunks", 0)
    progress = (uploaded_chunks / total_chunks * 100) if total_chunks > 0 else 0

    return {
        "recording_id": recording_id,
        "track_type": recording["track_type"],
        "total_chunks": total_chunks,
        "uploaded_chunks": uploaded_chunks,
        "progress_percentage": progress,
        "status": recording["status"],
        "chunks": recording.get("chunks", []),
    }


@router.get("/session/{session_id}/progress")
async def get_session_upload_progress(session_id: str):
    """
    Get upload progress for all recordings in a session

    Returns aggregated progress for audio, video, and screen tracks
    """
    session_recordings = [
        rec for rec in recordings_db.values()
        if rec["session_id"] == session_id
    ]

    if not session_recordings:
        return {
            "session_id": session_id,
            "tracks": {
                "audio": {"uploaded": 0, "total": 0},
                "video": {"uploaded": 0, "total": 0},
                "screen": {"uploaded": 0, "total": 0},
            }
        }

    tracks = {"audio": {}, "video": {}, "screen": {}}

    for rec in session_recordings:
        track_type = rec["track_type"]
        if track_type in tracks:
            tracks[track_type] = {
                "uploaded": rec.get("uploaded_chunks", 0),
                "total": rec.get("total_chunks", 0),
                "progress": (rec.get("uploaded_chunks", 0) / rec.get("total_chunks", 1) * 100) if rec.get("total_chunks", 0) > 0 else 0,
            }

    return {
        "session_id": session_id,
        "tracks": tracks,
    }
