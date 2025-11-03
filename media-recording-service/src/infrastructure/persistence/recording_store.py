"""
Recording Metadata Store

Provides asynchronous PostgreSQL persistence for recording and chunk metadata.
This adapter is shared between the REST endpoints, background workers, and
repository implementations so all components observe a single source of truth.
"""

from __future__ import annotations

import logging
from dataclasses import asdict
from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID, uuid4

from sqlalchemy import (
    JSON,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    delete,
    func,
    select,
    update,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

from src.domain.models import Recording, RecordingStatus, TrackType

logger = logging.getLogger(__name__)


class Base(DeclarativeBase):
    """Base declarative class for SQLAlchemy models."""


class RecordingMetadataModel(Base):
    """SQLAlchemy model representing recording metadata."""

    __tablename__ = "recording_metadata"

    recording_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    session_id: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    participant_id: Mapped[str] = mapped_column(String(128), index=True, nullable=False)
    track_type: Mapped[str] = mapped_column(String(16), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=False))
    paused_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=False))
    resumed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=False))
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=False))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
    metadata_blob: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    pause_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_pause_duration: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)

    total_chunks: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    uploaded_chunks: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_sequence: Mapped[int] = mapped_column(Integer, default=-1, nullable=False)
    checksum_failures: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    processing_status: Mapped[str] = mapped_column(
        String(32),
        default="pending",
        nullable=False,
    )
    processing_attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_processing_error: Mapped[Optional[str]] = mapped_column(Text)
    processed_asset_path: Mapped[Optional[str]] = mapped_column(String(512))
    processed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=False))
    chunks_cleaned: Mapped[bool] = mapped_column(default=False, nullable=False)

    chunks: Mapped[List["ChunkMetadataModel"]] = relationship(
        back_populates="recording",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class ChunkMetadataModel(Base):
    """SQLAlchemy model representing uploaded chunk metadata."""

    __tablename__ = "recording_chunks"

    chunk_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    recording_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("recording_metadata.recording_id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    checksum: Mapped[str] = mapped_column(String(128), nullable=False)
    content_type: Mapped[str] = mapped_column(String(64), nullable=False)
    minio_path: Mapped[str] = mapped_column(String(512), nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="uploaded", nullable=False)
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False),
        default=datetime.utcnow,
        nullable=False,
    )

    recording: Mapped[RecordingMetadataModel] = relationship(back_populates="chunks")

    __table_args__ = (
        UniqueConstraint("recording_id", "sequence", name="uq_recording_chunk_sequence"),
    )


class RecordingMetadataStore:
    """
    Asynchronous persistence layer for recording metadata.

    This store is responsible for:
      * Synchronising domain Recording aggregates to PostgreSQL
      * Tracking chunk uploads, counts, and manifests
      * Recording processing lifecycle metadata (attempts, errors, completion)
      * Providing summaries for REST/WebSocket payloads
    """

    def __init__(self, database_url: str, is_worker: bool = False):
        """
        Initialize the metadata store.
        
        Args:
            database_url: PostgreSQL connection string
            is_worker: True if running in worker context, False for web service
        """
        from sqlalchemy.pool import NullPool
        
        if is_worker:
            self._engine = create_async_engine(
                database_url,
                echo=False,
                poolclass=NullPool,
            )
            logger.info("RecordingMetadataStore initialized for worker (NullPool, psycopg)")
        else:
            self._engine = create_async_engine(
                database_url,
                echo=False,
                pool_size=10,
                max_overflow=20,
                pool_pre_ping=True,
                pool_recycle=3600,
            )
            logger.info("RecordingMetadataStore initialized for web service (pooled, psycopg)")
        
        self._session_factory: async_sessionmaker[AsyncSession] = async_sessionmaker(
            bind=self._engine,
            expire_on_commit=False,
        )
        self._initialized = False

    async def initialize(self) -> None:
        """Initialise database schema if it does not yet exist."""
        if self._initialized:
            return

        async with self._engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        self._initialized = True
        logger.info("Recording metadata store initialised")

    async def dispose(self) -> None:
        """Dispose database resources."""
        await self._engine.dispose()
        self._initialized = False

    async def save_recording(self, recording: Recording) -> None:
        """Insert or update a recording aggregate in the metadata store."""
        await self.initialize()

        async with self._session_factory() as session:
            async with session.begin():
                stmt = select(RecordingMetadataModel).where(
                    RecordingMetadataModel.recording_id == recording.recording_id
                )
                result = await session.execute(stmt)
                model = result.scalar_one_or_none()

                if not model:
                    model = RecordingMetadataModel(recording_id=recording.recording_id)
                    session.add(model)

                model.session_id = recording.session_id
                model.participant_id = recording.participant_id
                model.track_type = recording.track_type.value
                model.status = recording.status.value
                model.started_at = recording.started_at
                model.paused_at = recording.paused_at
                model.resumed_at = recording.resumed_at
                model.ended_at = recording.ended_at
                model.pause_count = recording.pause_count
                model.total_pause_duration = recording.total_pause_duration
                model.metadata_blob = recording.metadata or {}
                model.updated_at = datetime.utcnow()

    async def get_recording_as_domain(self, recording_id: UUID) -> Optional[Recording]:
        """Fetch a recording aggregate reconstructed from persisted metadata."""
        await self.initialize()

        async with self._session_factory() as session:
            result = await session.execute(
                select(RecordingMetadataModel).where(
                    RecordingMetadataModel.recording_id == recording_id
                )
            )
            model = result.scalar_one_or_none()

            if not model:
                return None

            return self._to_domain(model)

    async def list_recordings_as_domain(
        self,
        session_id: Optional[str] = None,
        participant_id: Optional[str] = None,
    ) -> List[Recording]:
        """List recordings matching optional filters."""
        await self.initialize()

        stmt = select(RecordingMetadataModel)
        if session_id:
            stmt = stmt.where(RecordingMetadataModel.session_id == session_id)
        if participant_id:
            stmt = stmt.where(RecordingMetadataModel.participant_id == participant_id)

        async with self._session_factory() as session:
            result = await session.execute(stmt)
            models = result.scalars().all()
            return [self._to_domain(model) for model in models]

    async def recording_exists(self, recording_id: UUID) -> bool:
        """Return True if the recording exists in metadata store."""
        await self.initialize()

        async with self._session_factory() as session:
            result = await session.execute(
                select(RecordingMetadataModel.recording_id).where(
                    RecordingMetadataModel.recording_id == recording_id
                )
            )
            return result.scalar_one_or_none() is not None

    async def delete_recording(self, recording_id: UUID) -> bool:
        """Delete a recording and its metadata."""
        await self.initialize()

        async with self._session_factory() as session:
            async with session.begin():
                result = await session.execute(
                    delete(RecordingMetadataModel).where(
                        RecordingMetadataModel.recording_id == recording_id
                    )
                )
                return result.rowcount > 0

    async def add_chunk(
        self,
        recording_id: UUID,
        *,
        sequence: int,
        size_bytes: int,
        checksum: str,
        content_type: str,
        minio_path: str,
    ) -> Dict[str, Any]:
        """Persist chunk metadata and update recording progress metrics."""
        await self.initialize()

        async with self._session_factory() as session:
            async with session.begin():
                meta_result = await session.execute(
                    select(RecordingMetadataModel).where(
                        RecordingMetadataModel.recording_id == recording_id
                    ).with_for_update()
                )
                metadata = meta_result.scalar_one_or_none()
                if not metadata:
                    raise ValueError(f"Recording {recording_id} not found")

                if metadata.status not in (
                    RecordingStatus.RECORDING.value,
                    RecordingStatus.PAUSED.value,
                ):
                    raise ValueError(
                        f"Cannot accept chunks when recording status is {metadata.status}"
                    )

                expected_sequence = metadata.last_sequence + 1
                if sequence != expected_sequence:
                    raise ValueError(
                        f"Out-of-order chunk sequence {sequence}; expected {expected_sequence}"
                    )

                chunk = ChunkMetadataModel(
                    chunk_id=uuid4(),
                    recording_id=recording_id,
                    sequence=sequence,
                    size_bytes=size_bytes,
                    checksum=checksum,
                    content_type=content_type,
                    minio_path=minio_path,
                    status="uploaded",
                    uploaded_at=datetime.utcnow(),
                )
                session.add(chunk)

                metadata.uploaded_chunks += 1
                metadata.total_chunks = metadata.uploaded_chunks
                metadata.last_sequence = sequence
                metadata.updated_at = datetime.utcnow()

                return {
                    "chunk_id": str(chunk.chunk_id),
                    "recording_id": str(chunk.recording_id),
                    "sequence": chunk.sequence,
                    "size_bytes": chunk.size_bytes,
                    "checksum": chunk.checksum,
                    "content_type": chunk.content_type,
                    "minio_path": chunk.minio_path,
                    "uploaded_at": chunk.uploaded_at.isoformat(),
                }

    async def increment_checksum_failure(self, recording_id: UUID) -> None:
        """Increment checksum failure counter for monitoring."""
        await self.initialize()

        async with self._session_factory() as session:
            async with session.begin():
                await session.execute(
                    update(RecordingMetadataModel)
                    .where(RecordingMetadataModel.recording_id == recording_id)
                    .values(
                        checksum_failures=RecordingMetadataModel.checksum_failures + 1,
                        updated_at=datetime.utcnow(),
                    )
                )

    async def get_recording_progress(self, recording_id: UUID) -> Dict[str, Any]:
        """Return progress metrics and chunk manifest for a recording."""
        await self.initialize()

        async with self._session_factory() as session:
            rec_result = await session.execute(
                select(RecordingMetadataModel).where(
                    RecordingMetadataModel.recording_id == recording_id
                )
            )
            recording = rec_result.scalar_one_or_none()
            if not recording:
                raise ValueError(f"Recording {recording_id} not found")

            chunk_result = await session.execute(
                select(ChunkMetadataModel)
                .where(ChunkMetadataModel.recording_id == recording_id)
                .order_by(ChunkMetadataModel.sequence)
            )
            chunks = [
                {
                    "sequence": chunk.sequence,
                    "size_bytes": chunk.size_bytes,
                    "checksum": chunk.checksum,
                    "content_type": chunk.content_type,
                    "minio_path": chunk.minio_path,
                    "uploaded_at": chunk.uploaded_at.isoformat(),
                    "status": chunk.status,
                }
                for chunk in chunk_result.scalars()
            ]

            progress = (
                (recording.uploaded_chunks / recording.total_chunks) * 100
                if recording.total_chunks > 0
                else 0.0
            )

            return {
                "recording_id": str(recording.recording_id),
                "session_id": recording.session_id,
                "participant_id": recording.participant_id,
                "track_type": recording.track_type,
                "status": recording.status,
                "total_chunks": recording.total_chunks,
                "uploaded_chunks": recording.uploaded_chunks,
                "progress_percentage": progress,
                "chunks": chunks,
                "processing_status": recording.processing_status,
                "processed_asset_path": recording.processed_asset_path,
                "processed_at": recording.processed_at.isoformat() if recording.processed_at else None,
            }

    async def list_session_progress(self, session_id: str) -> Dict[str, Any]:
        """Return aggregate progress metrics for all tracks in a session."""
        await self.initialize()

        async with self._session_factory() as session:
            result = await session.execute(
                select(RecordingMetadataModel).where(
                    RecordingMetadataModel.session_id == session_id
                )
            )
            recordings = result.scalars().all()

        tracks: Dict[str, Dict[str, Any]] = {}
        for recording in recordings:
            progress = (
                (recording.uploaded_chunks / recording.total_chunks) * 100
                if recording.total_chunks > 0
                else 0.0
            )
            tracks[recording.track_type] = {
                "uploaded": recording.uploaded_chunks,
                "total": recording.total_chunks,
                "progress": progress,
                "status": recording.status,
                "processing_status": recording.processing_status,
            }

        return {
            "session_id": session_id,
            "tracks": tracks,
        }

    async def list_sessions_for_participant(self, participant_id: str) -> List[Dict[str, Any]]:
        """Return sessions that include the given participant."""
        await self.initialize()

        async with self._session_factory() as session:
            result = await session.execute(
                select(
                    RecordingMetadataModel.session_id,
                    func.min(RecordingMetadataModel.started_at).label("first_started"),
                    func.min(RecordingMetadataModel.created_at).label("first_created"),
                    func.max(RecordingMetadataModel.updated_at).label("last_updated"),
                )
                .where(RecordingMetadataModel.participant_id == participant_id)
                .group_by(RecordingMetadataModel.session_id)
                .order_by(func.max(RecordingMetadataModel.updated_at).desc())
            )
            sessions: List[Dict[str, Any]] = []
            for row in result.all():
                first_started = row.first_started or row.first_created
                sessions.append(
                    {
                        "session_id": row.session_id,
                        "first_recorded_at": first_started.isoformat() if first_started else None,
                        "last_updated_at": row.last_updated.isoformat() if row.last_updated else None,
                    }
                )
        return sessions

    async def list_recordings_with_details(self, session_id: str) -> List[Dict[str, Any]]:
        """Return detailed recording metadata for a session."""
        await self.initialize()

        async with self._session_factory() as session:
            result = await session.execute(
                select(RecordingMetadataModel)
                .where(RecordingMetadataModel.session_id == session_id)
                .order_by(
                    RecordingMetadataModel.participant_id,
                    RecordingMetadataModel.track_type,
                    RecordingMetadataModel.created_at,
                )
            )
            recordings: List[Dict[str, Any]] = []
            for rec in result.scalars():
                recordings.append(
                    {
                        "recording_id": str(rec.recording_id),
                        "session_id": rec.session_id,
                        "participant_id": rec.participant_id,
                        "track_type": rec.track_type,
                        "status": rec.status,
                        "started_at": rec.started_at.isoformat() if rec.started_at else None,
                        "ended_at": rec.ended_at.isoformat() if rec.ended_at else None,
                        "created_at": rec.created_at.isoformat(),
                        "updated_at": rec.updated_at.isoformat(),
                        "total_chunks": rec.total_chunks,
                        "uploaded_chunks": rec.uploaded_chunks,
                        "processing_status": rec.processing_status,
                        "processed_asset_path": rec.processed_asset_path,
                        "metadata": rec.metadata_blob or {},
                    }
                )
        return recordings

    async def get_chunk_paths(self, recording_id: UUID) -> List[str]:
        """Return ordered MinIO object paths for a recording."""
        await self.initialize()

        async with self._session_factory() as session:
            result = await session.execute(
                select(ChunkMetadataModel.minio_path)
                .where(ChunkMetadataModel.recording_id == recording_id)
                .order_by(ChunkMetadataModel.sequence)
            )
            return [row[0] for row in result.fetchall()]

    async def mark_processing_started(self, recording_id: UUID) -> None:
        """Mark that processing has started for a recording."""
        await self.initialize()
        async with self._session_factory() as session:
            async with session.begin():
                await session.execute(
                    update(RecordingMetadataModel)
                    .where(RecordingMetadataModel.recording_id == recording_id)
                    .values(
                        processing_status="in_progress",
                        processing_attempts=RecordingMetadataModel.processing_attempts + 1,
                        last_processing_error=None,
                        updated_at=datetime.utcnow(),
                    )
                )

    async def mark_processing_enqueued(self, recording_id: UUID) -> None:
        """Mark that a recording has been queued for processing."""
        await self.initialize()
        async with self._session_factory() as session:
            async with session.begin():
                await session.execute(
                    update(RecordingMetadataModel)
                    .where(RecordingMetadataModel.recording_id == recording_id)
                    .values(
                        processing_status="queued",
                        updated_at=datetime.utcnow(),
                    )
                )

    async def mark_processing_completed(
        self,
        recording_id: UUID,
        *,
        processed_path: str,
        chunk_count: int,
        size_bytes: int,
    ) -> None:
        """Mark processing completion and store processed asset details."""
        await self.initialize()
        async with self._session_factory() as session:
            async with session.begin():
                result = await session.execute(
                    select(RecordingMetadataModel).where(
                        RecordingMetadataModel.recording_id == recording_id
                    ).with_for_update()
                )
                metadata = result.scalar_one_or_none()
                if not metadata:
                    return

                meta_blob = metadata.metadata_blob or {}
                meta_blob["processed"] = {
                    "chunk_count": chunk_count,
                    "size_bytes": size_bytes,
                    "path": processed_path,
                }
                metadata.processing_status = "completed"
                metadata.processed_asset_path = processed_path
                metadata.processed_at = datetime.utcnow()
                metadata.metadata_blob = meta_blob
                metadata.updated_at = datetime.utcnow()

    async def mark_processing_failed(self, recording_id: UUID, reason: str) -> None:
        """Mark processing failure and persist reason for diagnostics."""
        await self.initialize()
        async with self._session_factory() as session:
            async with session.begin():
                await session.execute(
                    update(RecordingMetadataModel)
                    .where(RecordingMetadataModel.recording_id == recording_id)
                    .values(
                        processing_status="failed",
                        status=RecordingStatus.FAILED.value,
                        last_processing_error=reason,
                        updated_at=datetime.utcnow(),
                    )
                )

    async def mark_chunks_cleaned(self, recording_id: UUID) -> None:
        """Mark that raw chunks were removed after processing."""
        await self.initialize()
        async with self._session_factory() as session:
            async with session.begin():
                await session.execute(
                    update(RecordingMetadataModel)
                    .where(RecordingMetadataModel.recording_id == recording_id)
                    .values(
                        chunks_cleaned=True,
                        updated_at=datetime.utcnow(),
                    )
                )

    async def delete_chunks(self, recording_id: UUID) -> None:
        """Delete chunk metadata rows for a recording."""
        await self.initialize()
        async with self._session_factory() as session:
            async with session.begin():
                await session.execute(
                    delete(ChunkMetadataModel).where(
                        ChunkMetadataModel.recording_id == recording_id
                    )
                )

    def _to_domain(self, model: RecordingMetadataModel) -> Recording:
        """Convert a metadata ORM model into a domain Recording aggregate."""
        recording = Recording(
            recording_id=model.recording_id,
            session_id=model.session_id,
            participant_id=model.participant_id,
            track_type=TrackType(model.track_type),
            status=RecordingStatus(model.status),
            metadata=model.metadata_blob or {},
            pause_count=model.pause_count,
            total_pause_duration=model.total_pause_duration,
            created_at=model.created_at,
            updated_at=model.updated_at,
            started_at=model.started_at,
            paused_at=model.paused_at,
            resumed_at=model.resumed_at,
            ended_at=model.ended_at,
        )
        return recording


def serialize_recording(recording: Recording) -> Dict[str, Any]:
    """Serialize a Recording domain object for JSON responses."""
    data = asdict(recording)
    data["recording_id"] = str(recording.recording_id)
    data["status"] = recording.status.value
    data["track_type"] = recording.track_type.value

    for field in ("started_at", "paused_at", "resumed_at", "ended_at", "created_at", "updated_at"):
        value = data.get(field)
        if isinstance(value, datetime):
            data[field] = value.isoformat()

    return data
