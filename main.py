import uvicorn

from core.config import config

if __name__ == "__main__":
    uvicorn.run(
        "core.server:app",
        port=8001,
        reload=True if config.ENVIRONMENT != "production" else False,
        workers=1,
    )
