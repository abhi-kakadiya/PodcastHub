"""
Upload REST API

REST endpoints for chunk upload management.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status, File, UploadFile, Form

from src.application.ports.inbound import UploadServicePort
from src.domain.exceptions import (
    UploadNotFoundException,
    ChunkNotFoundException,
    ChunkValidationException,
    RecordingNotFoundException,
)
from .dtos import (
    InitiateUploadRequest,
    UploadResponse,
    ChunkResponse,
    ErrorResponse,
)


router = APIRouter(prefix="/api/uploads", tags=["uploads"])


def get_upload_service() -> UploadServicePort:
    """Dependency injection for UploadService"""
    from src.infrastructure.dependencies import get_upload_service as get_svc

    return get_svc()


@router.post(
    "/initiate",
    response_model=UploadResponse,
    status_code=status.HTTP_201_CREATED,
    responses={
        201: {"description": "Upload initiated successfully"},
        404: {"model": ErrorResponse, "description": "Recording not found"},
        400: {"model": ErrorResponse, "description": "Invalid request"},
    },
    summary="Initiate an upload session",
    description="Initiates a chunked upload session for a recording.",
)
async def initiate_upload(
    request: InitiateUploadRequest,
    service: UploadServicePort = Depends(get_upload_service),
):
    """
    Initiate an upload session.

    This must be called before uploading chunks.
    """
    try:
        upload = await service.initiate_upload(
            recording_id=request.recording_id,
            session_id=request.session_id,
            file_name=request.file_name,
            mime_type=request.mime_type,
            total_chunks=request.total_chunks,
        )

        return UploadResponse(
            upload_id=upload.upload_id,
            recording_id=upload.recording_id,
            session_id=upload.session_id,
            status=upload.status.value,
            total_chunks=upload.total_chunks,
            uploaded_chunks=upload.uploaded_chunks,
            progress_percentage=upload.progress_percentage(),
            file_name=upload.file_name,
            mime_type=upload.mime_type,
        )

    except RecordingNotFoundException:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Recording {request.recording_id} not found",
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to initiate upload: {str(e)}",
        )


@router.post(
    "/chunk",
    response_model=ChunkResponse,
    status_code=status.HTTP_201_CREATED,
    responses={
        201: {"description": "Chunk uploaded successfully"},
        404: {"model": ErrorResponse, "description": "Upload not found"},
        400: {"model": ErrorResponse, "description": "Validation failed"},
    },
    summary="Upload a chunk",
    description="Uploads a single chunk of media data.",
)
async def upload_chunk(
    upload_id: UUID = Form(..., description="Upload ID"),
    sequence_number: int = Form(..., description="Chunk sequence number"),
    checksum: str = Form(..., description="MD5 checksum"),
    chunk_file: UploadFile = File(..., description="Chunk file data"),
    service: UploadServicePort = Depends(get_upload_service),
):
    """
    Upload a chunk.

    The chunk data is sent as multipart/form-data with the file.
    """
    try:
        # Read chunk data
        chunk_data = await chunk_file.read()

        chunk = await service.upload_chunk(
            upload_id=upload_id,
            sequence_number=sequence_number,
            chunk_data=chunk_data,
            checksum=checksum,
        )

        return ChunkResponse(
            chunk_id=chunk.chunk_id,
            recording_id=chunk.recording_id,
            sequence_number=chunk.sequence_number,
            data_size=chunk.data_size,
            status=chunk.status.value,
            uploaded_at=chunk.uploaded_at,
        )

    except UploadNotFoundException:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Upload {upload_id} not found",
        )
    except ChunkValidationException as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload chunk: {str(e)}",
        )


@router.get(
    "/{upload_id}/progress",
    response_model=dict,
    responses={
        200: {"description": "Progress retrieved successfully"},
        404: {"model": ErrorResponse, "description": "Upload not found"},
    },
    summary="Get upload progress",
    description="Retrieves the current progress of an upload session.",
)
async def get_upload_progress(
    upload_id: UUID,
    service: UploadServicePort = Depends(get_upload_service),
):
    """Get upload progress"""
    try:
        progress = await service.get_upload_progress(upload_id)
        return progress

    except UploadNotFoundException:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Upload {upload_id} not found",
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get upload progress: {str(e)}",
        )


@router.post(
    "/chunk/{chunk_id}/retry",
    response_model=ChunkResponse,
    responses={
        200: {"description": "Chunk marked for retry"},
        404: {"model": ErrorResponse, "description": "Chunk not found"},
        400: {"model": ErrorResponse, "description": "Cannot retry chunk"},
    },
    summary="Retry a failed chunk",
    description="Marks a failed chunk for retry.",
)
async def retry_chunk(
    chunk_id: UUID,
    service: UploadServicePort = Depends(get_upload_service),
):
    """
    Retry a failed chunk.

    This endpoint marks a failed chunk as pending so it can be uploaded again.
    """
    try:
        chunk = await service.retry_chunk(chunk_id)

        return ChunkResponse(
            chunk_id=chunk.chunk_id,
            recording_id=chunk.recording_id,
            sequence_number=chunk.sequence_number,
            data_size=chunk.data_size,
            status=chunk.status.value,
            uploaded_at=chunk.uploaded_at,
        )

    except ChunkNotFoundException:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Chunk {chunk_id} not found",
        )
    except ChunkValidationException as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retry chunk: {str(e)}",
        )
