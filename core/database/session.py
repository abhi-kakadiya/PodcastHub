from contextvars import ContextVar, Token
from typing import AsyncGenerator
from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_scoped_session,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.sql.expression import Delete, Insert, Update

from core.config import config

session_context: ContextVar[str] = ContextVar("session_context")


def get_session_context() -> str:
    return session_context.get()


def set_session_context(session_id: str) -> Token:
    return session_context.set(session_id)


def reset_session_context(context: Token) -> None:
    session_context.reset(context)


engines = {
    "writer": create_async_engine(config.POSTGRES_URL, pool_recycle=3600),
    "reader": create_async_engine(config.POSTGRES_URL, pool_recycle=3600),
}

# Async session makers for explicit read and write
WriteSession = async_sessionmaker(
    engines["writer"], expire_on_commit=False, class_=AsyncSession
)
ReadSession = async_sessionmaker(
    engines["reader"], expire_on_commit=False, class_=AsyncSession
)

SessionLocal = sessionmaker(bind=create_engine(config.POSTGRES_URL), autoflush=False, autocommit=False)

class RoutingSession(AsyncSession):
    async def get_bind(self, clause=None, **kwargs):
        """Route queries to the appropriate database engine."""
        if isinstance(clause, (Insert, Update, Delete)):
            return engines["writer"]
        return engines["reader"]

    async def execute(self, statement, *args, **kwargs):
        """Override execute to use the correct engine."""
        bind = await self.get_bind(statement)
        return await super().execute(statement, *args, bind=bind, **kwargs)


# Scoped session for handling multiple requests
session = async_scoped_session(
    session_factory=WriteSession,
    scopefunc=get_session_context,
)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """Dependency for getting an async session."""
    async with session() as s:
        try:
            yield s
        finally:
            await s.close()


Base = declarative_base()
