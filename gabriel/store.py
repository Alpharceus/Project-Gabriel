"""Per-machine SQLite history. One table; INSERT OR IGNORE on id dedupes
reconnect/catch-up overlap."""

import sqlite3
from pathlib import Path

_SCHEMA = """
CREATE TABLE IF NOT EXISTS messages (
    id        TEXT PRIMARY KEY,
    ts        TEXT NOT NULL,
    src       TEXT NOT NULL,
    kind      TEXT NOT NULL,
    body      TEXT NOT NULL,
    direction TEXT NOT NULL
)
"""


def _connect(db_path) -> sqlite3.Connection:
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.execute(_SCHEMA)
    return conn


def insert(db_path, msg: dict, direction: str) -> None:
    conn = _connect(db_path)
    try:
        with conn:
            conn.execute(
                "INSERT OR IGNORE INTO messages (id, ts, src, kind, body, direction)"
                " VALUES (?, ?, ?, ?, ?, ?)",
                (msg["id"], msg["ts"], msg["src"], msg["kind"], msg["body"], direction),
            )
    finally:
        conn.close()


def recent(db_path, n: int = 20) -> list[tuple]:
    """Last n messages as (ts, src, kind, body, direction), oldest first."""
    conn = _connect(db_path)
    try:
        rows = conn.execute(
            "SELECT ts, src, kind, body, direction FROM messages"
            " ORDER BY ts DESC LIMIT ?",
            (n,),
        ).fetchall()
    finally:
        conn.close()
    return list(reversed(rows))
