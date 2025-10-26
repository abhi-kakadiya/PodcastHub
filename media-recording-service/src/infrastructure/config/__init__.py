"""
Configuration Module

Manages application configuration using environment variables.
"""

from .settings import Settings, get_settings

__all__ = ["Settings", "get_settings"]
