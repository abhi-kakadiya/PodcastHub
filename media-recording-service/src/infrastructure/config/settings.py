"""
Application Settings

Configuration management using Pydantic Settings.
"""

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings


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

    # MinIO settings
    minio_endpoint: str = Field(
        default="localhost:9000",
        env="MINIO_ENDPOINT",
    )
    minio_access_key: str = Field(
        default="minioadmin",
        env="MINIO_ACCESS_KEY",
    )
    minio_secret_key: str = Field(
        default="minioadmin",
        env="MINIO_SECRET_KEY",
    )
    minio_secure: bool = Field(
        default=False,
        env="MINIO_SECURE",
    )
    minio_bucket: str = Field(
        default="recordings",
        env="MINIO_BUCKET",
    )

    # PostgreSQL settings
    postgres_host: str = Field(
        default="localhost",
        env="POSTGRES_HOST",
    )
    postgres_port: int = Field(
        default=5432,
        env="POSTGRES_PORT",
    )
    postgres_user: str = Field(
        default="podcasthub",
        env="POSTGRES_USER",
    )
    postgres_password: str = Field(
        default="podcasthub123",
        env="POSTGRES_PASSWORD",
    )
    postgres_database: str = Field(
        default="podcasthub",
        env="POSTGRES_DATABASE",
    )
    postgres_ssl_mode: str = Field(
        default="prefer", 
        env="POSTGRES_SSL_MODE"
    )
    persistence_backend: str = Field(
        default="postgres",
        env="PERSISTENCE_BACKEND",
    )

    # Redis settings
    redis_host: str = Field(
        default="localhost",
        env="REDIS_HOST",
    )
    redis_port: int = Field(
        default=6379,
        env="REDIS_PORT",
    )

    # Media processing queue
    media_processing_queue: str = Field(
        default="media.processing.requests",
        env="MEDIA_PROCESSING_QUEUE",
    )

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

    @property
    def database_url(self) -> str:
        """Get PostgreSQL connection URL with pgBouncer-compatible settings"""
        base_url = (
            f"postgresql+asyncpg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_database}"
        )
        
        params = []
        params.append("statement_cache_size=0")
        
        if self.postgres_ssl_mode and self.postgres_ssl_mode != "disable":
            params.append(f"ssl={self.postgres_ssl_mode}")
        
        if params:
            base_url += "?" + "&".join(params)
        
        return base_url


@lru_cache()
def get_settings() -> Settings:
    """
    Get cached settings instance.

    Using lru_cache ensures we only create one instance.
    """
    return Settings()