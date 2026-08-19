"""Per-machine SQLite history. INSERT OR IGNORE on id dedupes reconnect/
catch-up overlap. A tiny meta key-value table rides alongside for things
like the receive-loop's read cursor."""

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
);
CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT
)
"""


def _connect(db_path) -> sqlite3.Connection:
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.executescript(_SCHEMA)
    return conn


def insert(db_path, msg: dict, direction: str) -> bool:
    """Returns True if the row was newly inserted (False = already seen)."""
    conn = _connect(db_path)
    try:
        with conn:
            cur = conn.execute(
                "INSERT OR IGNORE INTO messages (id, ts, src, kind, body, direction)"
                " VALUES (?, ?, ?, ?, ?, ?)",
                (msg["id"], msg["ts"], msg["src"], msg["kind"], msg["body"], direction),
            )
            return cur.rowcount == 1
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


def get_meta(db_path, key: str) -> str | None:
    """Returns the stored value for key, or None if unset."""
    conn = _connect(db_path)
    try:
        row = conn.execute(
            "SELECT value FROM meta WHERE key = ?", (key,)
        ).fetchone()
    finally:
        conn.close()
    return row[0] if row else None


def set_meta(db_path, key: str, value: str) -> None:
    conn = _connect(db_path)
    try:
        with conn:
            conn.execute(
                "INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)",
                (key, value),
            )
    finally:
        conn.close()
