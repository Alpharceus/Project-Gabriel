"""Config loading. One file per machine: ~/.config/gabriel/config.toml.

Machines differ only in `src` (and maybe the DB path). Everything is
overridable by env var: GABRIEL_CONFIG, GABRIEL_SERVER, GABRIEL_TOPIC,
GABRIEL_SRC, GABRIEL_DB.
"""

import os
import tomllib
from dataclasses import dataclass
from pathlib import Path

CONFIG_DIR = Path.home() / ".config" / "gabriel"
DEFAULT_SERVER = "https://ntfy.sh"


@dataclass(frozen=True)
class Config:
    server: str
    topic: str
    src: str
    db: Path


def load() -> Config:
    path = Path(os.environ.get("GABRIEL_CONFIG", CONFIG_DIR / "config.toml"))
    data = {}
    if path.exists():
        with open(path, "rb") as f:
            data = tomllib.load(f)
    server = os.environ.get("GABRIEL_SERVER", data.get("server", DEFAULT_SERVER)).rstrip("/")
    topic = os.environ.get("GABRIEL_TOPIC", data.get("topic", ""))
    src = os.environ.get("GABRIEL_SRC", data.get("src", ""))
    db = Path(os.environ.get("GABRIEL_DB", data.get("db", path.parent / "gabriel.db")))
    if not topic or not src:
        raise RuntimeError(
            f"gabriel config incomplete: need 'topic' and 'src' in {path} "
            "(or GABRIEL_TOPIC / GABRIEL_SRC env vars)"
        )
    return Config(server=server, topic=topic, src=src, db=db)
