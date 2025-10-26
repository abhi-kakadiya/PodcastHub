"""
Domain Exceptions

Custom exceptions for domain-specific business rule violations.
"""


class DomainException(Exception):
    """Base exception for all domain exceptions"""

    pass


class RecordingNotFoundException(DomainException):
    """Raised when a recording is not found"""

    pass


class InvalidRecordingStateException(DomainException):
    """Raised when attempting invalid state transitions"""

    pass


class ChunkNotFoundException(DomainException):
    """Raised when a chunk is not found"""

    pass


class ChunkValidationException(DomainException):
    """Raised when chunk validation fails"""

    pass


class UploadNotFoundException(DomainException):
    """Raised when an upload is not found"""

    pass


class UploadFailedException(DomainException):
    """Raised when an upload fails"""

    pass
