import pickle
from typing import Any

import redis.asyncio as aioredis
import ujson

from core.cache.base import BaseBackend
from core.utils.datetime import serialize_datetime
from core.config import config

redis = aioredis.from_url(url=config.REDIS_URL, decode_responses=True)


class RedisBackend(BaseBackend):
    async def get(self, key: str) -> Any:
        result = await redis.get(key)
        if not result:
            return

        try:
            return ujson.loads(result)
        except UnicodeDecodeError:
            return pickle.loads(result)

    async def set(self, response: Any, key: str, ttl: int = 60) -> None:
        if isinstance(response, dict):
            response = ujson.dumps(response, default=serialize_datetime)
        elif isinstance(response, object):
            response = pickle.dumps(response)

        await redis.set(name=key, value=response, ex=ttl)

    async def delete_startswith(self, value: str) -> None:
        """Delete all keys matching prefix"""
        async for key in redis.scan_iter(value):
            await redis.delete(key)
