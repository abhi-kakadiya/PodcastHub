class QueueName:
    """Queue names for Celery tasks"""
    DEFAULT = "default"
    EMAIL = "email"
    MAINTENANCE = "maintenance"
    SOCIAL_MEDIA = "social_media"
    AI_PROCESSING = "ai_processing"
    SCHEDULED_POST = "scheduled_post"


class TaskPriority:
    """Priority levels for Celery tasks"""
    LOW = 1
    NORMAL = 5
    HIGH = 9
