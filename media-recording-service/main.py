"""
Media Recording & Upload Service

Main application entry point for the FastAPI service.

This service follows Hexagonal Architecture (Ports & Adapters) with:
- Domain layer: Pure business logic and models
- Application layer: Use cases and orchestration
- Adapters layer: REST API, WebSocket, RabbitMQ, Storage
- Infrastructure layer: Configuration and dependency injection
"""

import logging
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from src.adapters.inbound.rest import recording_router, upload_router
from src.adapters.inbound.rest.health_api import router as health_router
from src.adapters.inbound.websocket import websocket_router
from src.adapters.inbound.http.session_routes import router as session_router
from src.adapters.inbound.http.recording_routes import router as recording_routes_router
from src.adapters.inbound.http.upload_routes import router as upload_routes_router
from src.adapters.inbound.http.websocket_handler import router as websocket_handler_router
from src.adapters.inbound.http.host_routes import router as host_routes_router
from src.infrastructure.config import get_settings
from src.infrastructure.dependencies import initialize_dependencies, cleanup_dependencies


# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan handler.

    Manages startup and shutdown events.
    """
    # Startup
    logger.info("Starting Media Recording & Upload Service...")
    settings = get_settings()
    logger.info(f"Environment: {settings.environment}")
    logger.info(f"RabbitMQ URL: {settings.rabbitmq_url}")

    try:
        await initialize_dependencies()
        logger.info("Dependencies initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize dependencies: {e}")

    yield

    # Shutdown
    logger.info("Shutting down Media Recording & Upload Service...")
    await cleanup_dependencies()
    logger.info("Cleanup completed")


# Create FastAPI application
settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="""
    Media Recording & Upload Service for PodcastHub.

    ## Features

    * **Recording Management**: Start/stop recordings with WebRTC coordination
    * **Chunked Uploads**: Resilient chunked uploads with retry/resume capabilities
    * **Real-time Updates**: WebSocket support for progress tracking
    * **Event-Driven**: Publishes events to RabbitMQ for downstream processing

    ## Architecture

    This service follows **Hexagonal Architecture** (Ports & Adapters):

    - **Domain Layer**: Core business logic (Recording, Chunk, Upload models)
    - **Application Layer**: Use cases (RecordingService, UploadService)
    - **Adapters Layer**: REST API, WebSocket, RabbitMQ, In-memory Storage
    - **Infrastructure Layer**: Configuration and Dependency Injection

    ## Integration

    - Receives recording coordination from Session Management Service
    - Publishes `upload.completed` events to trigger Media Processing Service
    - Provides WebSocket endpoints for real-time progress updates
    """,
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Include routers
app.include_router(session_router)  # New simplified session routes
app.include_router(host_routes_router)  # Host-facing dashboard endpoints
app.include_router(recording_routes_router)  # New simplified recording routes
app.include_router(upload_routes_router)  # New simplified upload routes with MinIO
app.include_router(websocket_handler_router)  # New WebSocket signaling for WebRTC
app.include_router(recording_router)  # Original complex recording routes
app.include_router(upload_router)  # Original complex upload routes
app.include_router(websocket_router)  # Original WebSocket routes
app.include_router(health_router)


# Health check endpoint
@app.get("/health", tags=["monitoring"])
async def health_check():
    """
    Health check endpoint.

    Returns the service status and version.
    """
    return JSONResponse(
        content={
            "status": "healthy",
            "service": settings.app_name,
            "version": settings.app_version,
            "environment": settings.environment,
        }
    )


@app.get("/", tags=["root"])
async def root():
    """Root endpoint with service information"""
    return {
        "service": settings.app_name,
        "version": settings.app_version,
        "documentation": "/docs",
        "health": "/health",
    }


if __name__ == "__main__":
    # Run the application
    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
        log_level="info",
    )
