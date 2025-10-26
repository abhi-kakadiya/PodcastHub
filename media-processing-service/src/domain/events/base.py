"""
Base Domain Event
"""

from dataclasses import dataclass, field
from datetime import datetime
from uuid import UUID, uuid4


@dataclass
class DomainEvent:
    """Base class for all domain events"""

    event_id: UUID = field(default_factory=uuid4)
    event_type: str = ""
    occurred_at: datetime = field(default_factory=datetime.utcnow)
    aggregate_id: UUID = None
    version: int = 1
    metadata: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        """Convert event to dictionary"""
        return {
            "event_id": str(self.event_id),
            "event_type": self.event_type,
            "occurred_at": self.occurred_at.isoformat(),
            "aggregate_id": str(self.aggregate_id) if self.aggregate_id else None,
            "version": self.version,
            "metadata": self.metadata,
        }
