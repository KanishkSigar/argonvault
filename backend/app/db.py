from collections.abc import Iterator
from contextlib import contextmanager
from functools import lru_cache

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import get_settings


class Base(DeclarativeBase):
    pass


@lru_cache
def _engine():
    s = get_settings()
    connect_args = {"check_same_thread": False} if s.database_url.startswith("sqlite") else {}
    return create_engine(s.database_url, connect_args=connect_args, future=True)


@lru_cache
def _SessionLocal():
    return sessionmaker(bind=_engine(), autoflush=False, autocommit=False, expire_on_commit=False)


def init_db() -> None:
    """Create tables on app startup. Good enough for SQLite + portfolio scale."""
    from . import models  # noqa: F401  ensures mappers are registered

    Base.metadata.create_all(_engine())


def get_db() -> Iterator[Session]:
    """FastAPI dependency."""
    session = _SessionLocal()()
    try:
        yield session
    finally:
        session.close()


@contextmanager
def session_scope() -> Iterator[Session]:
    """Use outside request handlers (CLI, tests)."""
    session = _SessionLocal()()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
