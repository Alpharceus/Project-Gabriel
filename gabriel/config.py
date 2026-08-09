"""Config loading. One file per machine: ~/.config/gabriel/config.toml.

v3 (Firebase backend). Machines differ only in `src` (and maybe the DB
path). Everything is overridable by env var: GABRIEL_CONFIG, GABRIEL_SRC,
GABRIEL_KEY, GABRIEL_PROJECT, GABRIEL_CREDENTIALS, GABRIEL_DB.
"""

import os
import tomllib
from dataclasses import dataclass
from pathlib import Path

CONFIG_DIR = Path.home() / ".config" / "gabriel"


@dataclass(frozen=True)
class Config:
    src: str
    key: str          # base64url 256-bit E2E key (gabriel keygen)
    project: str      # Firebase project id
    credentials: Path  # service-account JSON for the Admin SDK
    db: Path


def load() -> Config:
    path = Path(os.environ.get("GABRIEL_CONFIG", CONFIG_DIR / "config.toml"))
    data = {}
    if path.exists():
        with open(path, "rb") as f:
            data = tomllib.load(f)

    def field(env: str, name: str, default=""):
        return os.environ.get(env, data.get(name, default))

    src = field("GABRIEL_SRC", "src")
    key = field("GABRIEL_KEY", "key")
    project = field("GABRIEL_PROJECT", "project")
    credentials = field("GABRIEL_CREDENTIALS", "credentials",
                        str(path.parent / "serviceAccount.json"))
    db = Path(field("GABRIEL_DB", "db", str(path.parent / "gabriel.db")))

    missing = [n for n, v in
               [("src", src), ("key", key), ("project", project)] if not v]
    if missing:
        raise RuntimeError(
            f"gabriel config incomplete: missing {', '.join(missing)} in {path} "
            "(or the GABRIEL_* env vars)"
        )
    return Config(src=src, key=key, project=project,
                  credentials=Path(os.path.expanduser(credentials)), db=db)
