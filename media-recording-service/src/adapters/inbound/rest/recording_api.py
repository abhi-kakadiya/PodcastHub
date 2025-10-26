"""
Recording REST API

REST endpoints for recording management.
This is an inbound adapter that translates HTTP requests to use case calls.
"""

from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from src.application.ports.inbound import RecordingServicePort
from src.domain.exceptions import (
    RecordingNotFoundException,
    InvalidRecordingStateException,
)
from .dtos import (
    StartRecordingRequest,
    RecordingResponse,
    RecordingStatusResponse,
    ErrorResponse,
    SuccessResponse,
)


router = APIRouter(prefix="/api/recordings", tags=["recordings"])


def get_recording_service() -> RecordingServicePort:
    """
    Dependency injection for RecordingService.

    This will be overridden in main.py with actual implementation.
    """
    from src.infrastructure.dependencies import get_recording_service as get_svc

    return get_svc()


@router.post(
    "/start",
    response_model=RecordingResponse,
    status_code=status.HTTP_201_CREATED,
    responses={
        201: {"description": "Recording started successfully"},
        400: {"model": ErrorResponse, "description": "Invalid request"},
        500: {"model": ErrorResponse, "description": "Internal server error"},
    },
    summary="Start a new recording",
    description="Initiates a new recording session for a participant in a podcast session.",
)
async def start_recording(
    request: StartRecordingRequest,
    service: RecordingServicePort = Depends(get_recording_service),
):
    """
    Start a new recording.

    This endpoint:
    1. Creates a new recording
    2. Starts the recording
    3. Publishes a RecordingStarted event to RabbitMQ
    """
    try:
        recording = await service.start_recording(
            session_id=request.session_id,
            participant_id=request.participant_id,
            media_type=request.media_type,
        )

        return RecordingResponse(
            recording_id=recording.recording_id,
            session_id=recording.session_id,
            participant_id=recording.participant_id,
            status=recording.status,
            media_type=recording.media_type,
            started_at=recording.started_at,
            ended_at=recording.ended_at,
            created_at=recording.created_at,
            duration_seconds=recording.duration_seconds(),
        )

    except InvalidRecordingStateException as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to start recording: {str(e)}",
        )


@router.post(
    "/{recording_id}/stop",
    response_model=RecordingResponse,
    responses={
        200: {"description": "Recording stopped successfully"},
        404: {"model": ErrorResponse, "description": "Recording not found"},
        400: {"model": ErrorResponse, "description": "Invalid state transition"},
    },
    summary="Stop a recording",
    description="Stops an active recording session.",
)
async def stop_recording(
    recording_id: UUID,
    service: RecordingServicePort = Depends(get_recording_service),
):
    """
    Stop a recording.

    This endpoint:
    1. Stops the recording
    2. Publishes a RecordingEnded event to RabbitMQ
    """
    try:
        recording = await service.stop_recording(recording_id)

        return RecordingResponse(
            recording_id=recording.recording_id,
            session_id=recording.session_id,
            participant_id=recording.participant_id,
            status=recording.status,
            media_type=recording.media_type,
            started_at=recording.started_at,
            ended_at=recording.ended_at,
            created_at=recording.created_at,
            duration_seconds=recording.duration_seconds(),
        )

    except RecordingNotFoundException:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Recording {recording_id} not found",
        )
    except InvalidRecordingStateException as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to stop recording: {str(e)}",
        )


@router.get(
    "/{recording_id}",
    response_model=RecordingResponse,
    responses={
        200: {"description": "Recording found"},
        404: {"model": ErrorResponse, "description": "Recording not found"},
    },
    summary="Get recording details",
    description="Retrieves details of a specific recording.",
)
async def get_recording(
    recording_id: UUID,
    service: RecordingServicePort = Depends(get_recording_service),
):
    """Get recording by ID"""
    recording = await service.get_recording(recording_id)

    if not recording:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Recording {recording_id} not found",
        )

    return RecordingResponse(
        recording_id=recording.recording_id,
        session_id=recording.session_id,
        participant_id=recording.participant_id,
        status=recording.status,
        media_type=recording.media_type,
        started_at=recording.started_at,
        ended_at=recording.ended_at,
        created_at=recording.created_at,
        duration_seconds=recording.duration_seconds(),
    )


@router.get(
    "/{recording_id}/status",
    response_model=RecordingStatusResponse,
    responses={
        200: {"description": "Status retrieved successfully"},
        404: {"model": ErrorResponse, "description": "Recording not found"},
    },
    summary="Get recording status with upload progress",
    description="Retrieves detailed status of a recording including upload progress.",
)
async def get_recording_status(
    recording_id: UUID,
    service: RecordingServicePort = Depends(get_recording_service),
):
    """Get detailed recording status including upload progress"""
    try:
        status_info = await service.get_recording_status(recording_id)
        return status_info

    except RecordingNotFoundException:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Recording {recording_id} not found",
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get recording status: {str(e)}",
        )


@router.get(
    "/session/{session_id}",
    response_model=List[RecordingResponse],
    responses={
        200: {"description": "Recordings retrieved successfully"},
    },
    summary="Get all recordings for a session",
    description="Retrieves all recordings for a specific podcast session.",
)
async def get_session_recordings(
    session_id: str,
    service: RecordingServicePort = Depends(get_recording_service),
):
    """Get all recordings for a session"""
    recordings = await service.get_recordings_by_session(session_id)

    return [
        RecordingResponse(
            recording_id=rec.recording_id,
            session_id=rec.session_id,
            participant_id=rec.participant_id,
            status=rec.status,
            media_type=rec.media_type,
            started_at=rec.started_at,
            ended_at=rec.ended_at,
            created_at=rec.created_at,
            duration_seconds=rec.duration_seconds(),
        )
        for rec in recordings
    ]
