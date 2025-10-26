"""
Processing REST API
"""

from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from src.application.ports.inbound import ProcessingServicePort


router = APIRouter(prefix="/api/processing", tags=["processing"])


# DTOs
class CreateJobRequest(BaseModel):
    session_id: str = Field(..., description="Session ID")
    recording_ids: List[UUID] = Field(..., description="List of recording IDs to process")
    output_format: str = Field(default="mp3", description="Output format (mp3, wav, mp4)")


class JobResponse(BaseModel):
    job_id: UUID
    session_id: str
    status: str
    total_tracks: int
    output_format: str


def get_processing_service() -> ProcessingServicePort:
    """Dependency injection"""
    from src.infrastructure.dependencies import get_processing_service as get_svc
    return get_svc()


@router.post(
    "/jobs",
    response_model=JobResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a processing job",
)
async def create_job(
    request: CreateJobRequest,
    service: ProcessingServicePort = Depends(get_processing_service),
):
    """Create a new media processing job"""
    try:
        job = await service.create_job(
            session_id=request.session_id,
            recording_ids=request.recording_ids,
            output_format=request.output_format,
        )

        return JobResponse(
            job_id=job.job_id,
            session_id=job.session_id,
            status=job.status.value,
            total_tracks=job.total_tracks,
            output_format=job.output_format,
        )

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create job: {str(e)}",
        )


@router.post(
    "/jobs/{job_id}/start",
    response_model=JobResponse,
    summary="Start processing a job",
)
async def start_job(
    job_id: UUID,
    service: ProcessingServicePort = Depends(get_processing_service),
):
    """Start processing a job"""
    try:
        job = await service.start_processing(job_id)

        return JobResponse(
            job_id=job.job_id,
            session_id=job.session_id,
            status=job.status.value,
            total_tracks=job.total_tracks,
            output_format=job.output_format,
        )

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to start job: {str(e)}",
        )


@router.get(
    "/jobs/{job_id}",
    response_model=dict,
    summary="Get job status",
)
async def get_job_status(
    job_id: UUID,
    service: ProcessingServicePort = Depends(get_processing_service),
):
    """Get detailed job status"""
    try:
        return await service.get_job_status(job_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Job {job_id} not found",
        )
