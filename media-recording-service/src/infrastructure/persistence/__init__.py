"""
Persistence helpers exposed to the service layer.
"""

from typing import Optional

from src.infrastructure.config import get_settings
from .recording_store import RecordingMetadataStore

_metadata_store: Optional[RecordingMetadataStore] = None


def get_recording_metadata_store() -> RecordingMetadataStore:
    """Return a singleton RecordingMetadataStore."""
    global _metadata_store
    if _metadata_store is None:
        settings = get_settings()
        _metadata_store = RecordingMetadataStore(settings.database_url, settings.is_worker)
    return _metadata_store


__all__ = ["get_recording_metadata_store", "RecordingMetadataStore"]
