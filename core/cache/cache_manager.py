from functools import wraps
from typing import List, Type

from .base import BaseBackend, BaseKeyMaker
from .cache_tag import CacheTag
from .custom_key_maker import CustomKeyMaker


class CacheManager:
    def __init__(self):
        self.backend = None
        self.key_maker = None

    def init(self, backend: Type[BaseBackend], key_maker: Type[BaseKeyMaker]) -> None:
        self.backend = backend
        self.key_maker = key_maker

    def cached(
        self,
        key_params: List[str],
        prefix: str = None,
        tag: CacheTag = None,
        ttl: int = 300,
    ):

        def _cached(function):
            @wraps(function)
            async def __cached(*args, **kwargs):
                if not self.backend or not self.key_maker:
                    raise ValueError("Backend or KeyMaker not initialized")

                key = await self.key_maker.make(
                    function=function,
                    prefix=prefix if prefix else tag.value,
                    args=args,
                    kwargs=kwargs,
                    key_params=key_params,
                )

                cached_response = await self.backend.get(key=key)
                if cached_response:
                    return cached_response
                response = await function(*args, **kwargs)
                await self.backend.set(response=response, key=key, ttl=ttl)
                return response

            return __cached

        return _cached

    async def remove_by_tag(self, tag: CacheTag) -> None:
        await self.backend.delete_startswith(value=tag.value)

    async def remove_by_prefix(self, prefix: str) -> None:
        await self.backend.delete_startswith(value=prefix)

    async def remove_by_key(
        self, prefix: str, key_params: List[str], *args, **kwargs
    ) -> None:
        """
        Invalidate cache based on the same key structure.
        """

        key_values = [
            CustomKeyMaker.get_nested_value(kwargs.get(param.split(".")[0], {}), param)
            for param in key_params
        ]

        arg_values = "::".join(key_values)
        cache_key = f"{prefix}.{arg_values}" if arg_values else prefix

        await self.backend.delete_startswith(cache_key)
        return cache_key


Cache = CacheManager()
