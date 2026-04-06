"""Database engine and session helpers."""

from __future__ import annotations

import os
from functools import lru_cache
from typing import Generator

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker


class Base(DeclarativeBase):
    """Base class for SQLAlchemy declarative models."""


@lru_cache(maxsize=1)
def get_database_url() -> str:
    """Return the configured SQLAlchemy database URL.

    The default targets a local PostGIS-enabled PostgreSQL instance.
    """

    return os.getenv(
        "DATABASE_URL",
        "postgresql+psycopg2://postgres:postgres@localhost:5432/heat_backend",
    )


@lru_cache(maxsize=1)
def get_engine() -> Engine:
    """Create and cache the SQLAlchemy engine."""

    echo = os.getenv("SQLALCHEMY_ECHO", "false").lower() == "true"
    return create_engine(
        get_database_url(),
        echo=echo,
        future=True,
        pool_pre_ping=True,
    )


SessionLocal = sessionmaker(
    bind=get_engine(),
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,
    class_=Session,
)


def get_session() -> Generator[Session, None, None]:
    """Yield a database session for FastAPI dependencies."""

    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()

