"""
Application Settings for Processing Service
"""

from functools import lru_cache
from pydantic import BaseSettings, Field


class Settings(BaseSettings):
    app_name: str = "Media Processing Service"
    app_version: str = "1.0.0"
    environment: str = Field(default="development", env="ENVIRONMENT")
    debug: bool = Field(default=True, env="DEBUG")

    host: str = Field(default="0.0.0.0", env="HOST")
    port: int = Field(default=8002, env="PORT")

    rabbitmq_url: str = Field(
        default="amqp://guest:guest@localhost:5672/",
        env="RABBITMQ_URL",
    )
    rabbitmq_exchange: str = Field(
        default="podcast_events",
        env="RABBITMQ_EXCHANGE",
    )

    cors_origins: list[str] = Field(
        default=["http://localhost:3000", "http://localhost:8080"],
        env="CORS_ORIGINS",
    )

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
