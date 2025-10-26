"""
Application Settings

Configuration management using Pydantic Settings.
"""

from functools import lru_cache
from typing import Optional

from pydantic import BaseSettings, Field


class Settings(BaseSettings):
    """
    Application settings loaded from environment variables.

    Follows 12-factor app principles for configuration.
    """

    # Application settings
    app_name: str = "Media Recording & Upload Service"
    app_version: str = "1.0.0"
    environment: str = Field(default="development", env="ENVIRONMENT")
    debug: bool = Field(default=True, env="DEBUG")

    # Server settings
    host: str = Field(default="0.0.0.0", env="HOST")
    port: int = Field(default=8001, env="PORT")

    # RabbitMQ settings
    rabbitmq_url: str = Field(
        default="amqp://guest:guest@localhost:5672/",
        env="RABBITMQ_URL",
    )
    rabbitmq_exchange: str = Field(
        default="podcast_events",
        env="RABBITMQ_EXCHANGE",
    )

    # CORS settings
    cors_origins: list[str] = Field(
        default=["http://localhost:3000", "http://localhost:8080"],
        env="CORS_ORIGINS",
    )

    # Upload settings
    max_chunk_size: int = Field(
        default=5 * 1024 * 1024,  # 5MB
        env="MAX_CHUNK_SIZE",
    )
    max_upload_size: int = Field(
        default=500 * 1024 * 1024,  # 500MB
        env="MAX_UPLOAD_SIZE",
    )

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    """
    Get cached settings instance.

    Using lru_cache ensures we only create one instance.
    """
    return Settings()
