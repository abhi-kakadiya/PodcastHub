"""
Simple health check HTTP server for the worker.
Allows Render to verify the worker is alive.
"""

import os
import logging
from aiohttp import web

logger = logging.getLogger(__name__)


async def health_check(request):
    """Health check endpoint."""
    return web.json_response({
        "status": "healthy",
        "service": "media-processing-worker"
    })


async def start_health_server():
    """Start a minimal HTTP server for health checks."""
    app = web.Application()
    app.router.add_get('/health', health_check)
    app.router.add_get('/', health_check)
    
    port = int(os.getenv('PORT', 10000))
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, '0.0.0.0', port)
    await site.start()
    
    logger.info(f"Worker health server running on port {port}")
    
    import asyncio
    await asyncio.Future()