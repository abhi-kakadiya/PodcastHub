from celery import Celery
from celery.schedules import crontab
from core.config import config
from worker.constants import QueueName, TaskPriority

# Initialize Celery app
celery_app = Celery(
    "tregoai_tasks",
    broker=config.CELERY_BROKER_URL,
    backend=config.CELERY_BACKEND_URL,
)

# Monitor tasks
celery_app.conf.task_track_started = True