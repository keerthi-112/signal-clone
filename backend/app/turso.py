"""SQLAlchemy engine for a hosted libSQL (Turso) database.

libSQL is a fork of SQLite with the same SQL and file format, so the app keeps using
SQLAlchemy's SQLite dialect unchanged; only the driver differs. The `libsql` driver is
close to Python's `sqlite3` but not identical, so a thin adapter smooths over the gaps:

- errors are raised as plain `ValueError`; they are re-raised as the matching `sqlite3`
  exception so SQLAlchemy reports them as `IntegrityError` / `OperationalError`;
- a cursor's `rowcount` accumulates across statements, so every statement gets a fresh cursor;
- blobs must be passed as `bytes`, not `memoryview`;
- `create_function()` is unsupported; SQLAlchemy uses it only for regexp()/floor(), which
  this app never calls.
"""

import sqlite3
from collections.abc import Iterator, Sequence
from contextlib import contextmanager
from typing import Any

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.pool import QueuePool


@contextmanager
def _as_sqlite3_errors() -> Iterator[None]:
    try:
        yield
    except sqlite3.Error:
        raise
    except Exception as exc:  # libsql raises ValueError (or libsql.Error) for SQL errors
        message = str(exc)
        error = sqlite3.IntegrityError if "constraint failed" in message else sqlite3.OperationalError
        raise error(message) from exc


def _params(params: Sequence[Any]) -> tuple[Any, ...]:
    return tuple(bytes(p) if isinstance(p, memoryview) else p for p in params)


class _Cursor:
    def __init__(self, conn: Any) -> None:
        self._conn = conn
        self._cursor: Any = None

    def execute(self, sql: str, params: Sequence[Any] = ()) -> "_Cursor":
        self._cursor = self._conn.cursor()
        with _as_sqlite3_errors():
            self._cursor.execute(sql, _params(params))
        return self

    def executemany(self, sql: str, seq: Sequence[Sequence[Any]]) -> "_Cursor":
        self._cursor = self._conn.cursor()
        with _as_sqlite3_errors():
            self._cursor.executemany(sql, [_params(p) for p in seq])
        return self

    def close(self) -> None:
        if self._cursor is not None:
            self._cursor.close()

    def __getattr__(self, name: str) -> Any:  # description, rowcount, lastrowid, fetch*()
        return getattr(self._cursor, name)


class _Connection:
    def __init__(self, conn: Any) -> None:
        self._conn = conn

    def cursor(self) -> _Cursor:
        return _Cursor(self._conn)

    def commit(self) -> None:
        with _as_sqlite3_errors():
            self._conn.commit()

    def rollback(self) -> None:
        with _as_sqlite3_errors():
            self._conn.rollback()

    def close(self) -> None:
        self._conn.close()

    def create_function(self, *args: Any, **kwargs: Any) -> None:
        pass

    def __getattr__(self, name: str) -> Any:
        return getattr(self._conn, name)


def make_libsql_engine(url: str, auth_token: str) -> Engine:
    import libsql

    def connect() -> _Connection:
        return _Connection(libsql.connect(url, auth_token=auth_token))

    # "sqlite://" selects the SQLite dialect; the creator supplies the libsql connection.
    return create_engine("sqlite://", creator=connect, poolclass=QueuePool, pool_pre_ping=True)
