"""
Data Transfer Objects (DTOs)

These are used for API request/response serialization.
They are separate from domain models to maintain clean architecture.
"""

from datetime import datetime
from enum import Enum
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


# Request DTOs

class StartRecordingRequest(BaseModel):
    """Request to start a recording"""

    session_id: str = Field(..., description="Session ID")
    participant_id: str = Field(..., description="Participant ID")
    track_type: str = Field(default="audio", description="Type of media track (audio/video/screen)")

    class Config:
        schema_extra = {
            "example": {
                "session_id": "session_123",
                "participant_id": "user_456",
                "track_type": "audio",
            }
        }


class InitiateUploadRequest(BaseModel):
    """Request to initiate an upload session"""

    recording_id: UUID = Field(..., description="Recording ID")
    session_id: str = Field(..., description="Session ID")
    file_name: str = Field(..., description="File name")
    mime_type: str = Field(..., description="MIME type")
    total_chunks: int = Field(..., gt=0, description="Total number of chunks")

    class Config:
        schema_extra = {
            "example": {
                "recording_id": "123e4567-e89b-12d3-a456-426614174000",
                "session_id": "session_123",
                "file_name": "recording_audio.webm",
                "mime_type": "audio/webm",
                "total_chunks": 10,
            }
        }


class UploadChunkRequest(BaseModel):
    """Request to upload a chunk"""

    upload_id: UUID = Field(..., description="Upload ID")
    sequence_number: int = Field(..., ge=0, description="Chunk sequence number")
    checksum: str = Field(..., description="MD5 checksum of chunk data")

    class Config:
        schema_extra = {
            "example": {
                "upload_id": "123e4567-e89b-12d3-a456-426614174000",
                "sequence_number": 0,
                "checksum": "5d41402abc4b2a76b9719d911017c592",
            }
        }


# Response DTOs

class RecordingStatusEnum(str, Enum):
    """Recording status enumeration"""
    WAITING = "waiting"
    RECORDING = "recording"
    PAUSED = "paused"
    STOPPED = "stopped"
    FAILED = "failed"


class TrackTypeEnum(str, Enum):
    """Track type enumeration for multi-track recording"""
    AUDIO = "audio"
    VIDEO = "video"
    SCREEN = "screen"


class RecordingResponse(BaseModel):
    """Response containing recording information"""

    recording_id: UUID
    session_id: str
    participant_id: str
    status: RecordingStatusEnum
    track_type: str
    started_at: Optional[datetime]
    ended_at: Optional[datetime]
    created_at: datetime
    duration_seconds: Optional[float] = 0.0

    class Config:
        schema_extra = {
            "example": {
                "recording_id": "123e4567-e89b-12d3-a456-426614174000",
                "session_id": "session_123",
                "participant_id": "user_456",
                "status": "recording",
                "track_type": "audio",
                "started_at": "2025-10-26T10:00:00",
                "ended_at": None,
                "created_at": "2025-10-26T09:59:00",
                "duration_seconds": 120.5,
            }
        }


class UploadResponse(BaseModel):
    """Response containing upload information"""

    upload_id: UUID
    recording_id: UUID
    session_id: str
    status: str
    total_chunks: int
    uploaded_chunks: int
    progress_percentage: float
    file_name: str
    mime_type: str

    class Config:
        schema_extra = {
            "example": {
                "upload_id": "123e4567-e89b-12d3-a456-426614174000",
                "recording_id": "123e4567-e89b-12d3-a456-426614174001",
                "session_id": "session_123",
                "status": "in_progress",
                "total_chunks": 10,
                "uploaded_chunks": 5,
                "progress_percentage": 50.0,
                "file_name": "recording_audio.webm",
                "mime_type": "audio/webm",
            }
        }


class ChunkResponse(BaseModel):
    """Response containing chunk information"""

    chunk_id: UUID
    recording_id: UUID
    sequence_number: int
    data_size: int
    status: str
    uploaded_at: Optional[datetime]

    class Config:
        schema_extra = {
            "example": {
                "chunk_id": "123e4567-e89b-12d3-a456-426614174000",
                "recording_id": "123e4567-e89b-12d3-a456-426614174001",
                "sequence_number": 0,
                "data_size": 1024000,
                "status": "uploaded",
                "uploaded_at": "2025-10-26T10:01:00",
            }
        }


class RecordingStatusResponse(BaseModel):
    """Detailed recording status including upload progress"""

    recording_id: str
    session_id: str
    participant_id: str
    status: str
    track_type: str
    started_at: Optional[str]
    ended_at: Optional[str]
    duration_seconds: float
    upload: Optional[dict] = None

    class Config:
        schema_extra = {
            "example": {
                "recording_id": "123e4567-e89b-12d3-a456-426614174000",
                "session_id": "session_123",
                "participant_id": "user_456",
                "status": "stopped",
                "track_type": "audio",
                "started_at": "2025-10-26T10:00:00",
                "ended_at": "2025-10-26T10:05:00",
                "duration_seconds": 300.0,
                "upload": {
                    "upload_id": "123e4567-e89b-12d3-a456-426614174001",
                    "status": "completed",
                    "progress_percentage": 100.0,
                    "uploaded_chunks": 10,
                    "total_chunks": 10,
                },
            }
        }


class ErrorResponse(BaseModel):
    """Error response"""

    error: str
    detail: Optional[str] = None
    error_code: Optional[str] = None

    class Config:
        schema_extra = {
            "example": {
                "error": "Recording not found",
                "detail": "Recording with ID 123 does not exist",
                "error_code": "RECORDING_NOT_FOUND",
            }
        }


class SuccessResponse(BaseModel):
    """Generic success response"""

    message: str
    data: Optional[dict] = None

    class Config:
        schema_extra = {
            "example": {
                "message": "Operation completed successfully",
                "data": {"resource_id": "123"},
            }
        }
