"""
Media Processing Service - Main Application
"""

import logging
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from src.adapters.inbound.rest.processing_api import router as processing_router
from src.infrastructure.config.settings import get_settings
from src.infrastructure.dependencies import initialize_dependencies, cleanup_dependencies


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting Media Processing Service...")
    settings = get_settings()
    logger.info(f"Environment: {settings.environment}")

    try:
        await initialize_dependencies()
        logger.info("Dependencies initialized")
    except Exception as e:
        logger.error(f"Failed to initialize: {e}")

    yield

    logger.info("Shutting down...")
    await cleanup_dependencies()


settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="Media Processing Service - Synchronizes, enhances, and mixes podcast tracks",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(processing_router)


@app.get("/health", tags=["monitoring"])
async def health_check():
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
    return {
        "service": settings.app_name,
        "version": settings.app_version,
        "documentation": "/docs",
    }


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
    )
