import inspect
from typing import Callable, List

from core.cache.base import BaseKeyMaker


class CustomKeyMaker(BaseKeyMaker):
    @classmethod
    def get_nested_value(cls, obj, attr_path):
        """Recursively get attributes from an object using dot notation."""
        attrs = attr_path.split(".")
        for attr in attrs:
            res = getattr(obj, attr, None)
            if res:
                return f"{attr_path}.{res}"
        return "unknown"

    async def make(
        self, function: Callable, prefix: str, args, kwargs, key_params: List[str]
    ) -> str:
        bound_args = inspect.signature(function).bind(*args, **kwargs)
        bound_args.apply_defaults()

        key_values = [
            self.__class__.get_nested_value(
                bound_args.arguments.get(param.split(".")[0]), param
            )
            for param in key_params
        ]

        arg_values = "::".join(key_values)

        return f"{prefix}.{arg_values}" if arg_values else prefix
