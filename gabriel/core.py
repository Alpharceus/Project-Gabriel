"""Gabriel core: send() and receive_loop().

Library boundary rules: nothing here imports cli, prints, or touches
sys.argv. Pure Python, stdlib + requests, no platform conditionals.
"""

import json
import logging
import time
import uuid
from datetime import datetime, timezone

import requests

from . import config, store

log = logging.getLogger("gabriel")

# ntfy sends a keepalive event roughly every 45s; silence beyond this means
# the stream is dead even if the socket looks alive (sleep/suspend kill the
# connection differently per OS — don't trust the socket).
_READ_TIMEOUT = 90
_CONNECT_TIMEOUT = 10
_RECONNECT_DELAY = 5


def send(body: str, kind: str = "text", src: str | None = None) -> str:
    """Publish to the group topic. Returns the message id.

    Raises on failure; no retry, no queue — callers decide.
    `src=None` falls back to config; the override is how agents label
    themselves.
    """
    cfg = config.load()
    src = src or cfg.src
    msg = {
        "v": 1,
        "id": str(uuid.uuid4()),
        "ts": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "src": src,
        "kind": kind,
        "body": body,
    }
    headers = {"Title": src}
    if kind == "url":
        headers["Click"] = body
    resp = requests.post(
        f"{cfg.server}/{cfg.topic}",
        data=json.dumps(msg).encode(),
        headers=headers,
        timeout=(_CONNECT_TIMEOUT, _CONNECT_TIMEOUT),
    )
    resp.raise_for_status()
    store.insert(cfg.db, msg, direction="out")
    return msg["id"]


def receive_loop() -> None:
    """Subscribe to the group topic's JSON stream forever.

    Logs everything except own messages (src == self) to the local DB.
    Reconnects on any drop; a read timeout catches silently-dead sockets.
    """
    cfg = config.load()
    url = f"{cfg.server}/{cfg.topic}/json"
    while True:
        try:
            log.info("connecting: %s (src=%s)", url, cfg.src)
            with requests.get(
                url, stream=True, timeout=(_CONNECT_TIMEOUT, _READ_TIMEOUT)
            ) as resp:
                resp.raise_for_status()
                for line in resp.iter_lines():
                    if line:
                        _handle_line(cfg, line)
        except Exception:
            log.exception("stream dropped; reconnecting in %ss", _RECONNECT_DELAY)
            time.sleep(_RECONNECT_DELAY)


def _handle_line(cfg: config.Config, line: bytes) -> None:
    event = json.loads(line)
    if event.get("event") != "message":
        return  # open / keepalive
    msg = _parse_message(event)
    # Own messages echo back on the stream: archive them as outbound instead
    # of dropping, so sends that bypassed send() (e.g. the web UI) still land
    # in the DB. INSERT OR IGNORE no-ops when send() already logged them.
    direction = "out" if msg["src"] == cfg.src else "in"
    store.insert(cfg.db, msg, direction)
    if direction == "in":
        log.info("in: %s: %s", msg["src"], msg["body"][:120])


def _parse_message(event: dict) -> dict:
    """Envelope if the body parses as one, else wrap bare text as a phone
    message (share sheet / in-app compose sends raw text)."""
    raw = event.get("message", "")
    try:
        msg = json.loads(raw)
        if isinstance(msg, dict) and "src" in msg and "body" in msg:
            msg.setdefault("id", event["id"])
            msg.setdefault("ts", _event_ts(event))
            msg.setdefault("kind", "text")
            return msg
    except (ValueError, TypeError):
        pass
    return {
        "v": 1,
        "id": event["id"],  # ntfy's id is stable across subscribers, so DBs converge
        "ts": _event_ts(event),
        "src": "phone",
        "kind": "text",
        "body": raw,
    }


def _event_ts(event: dict) -> str:
    return datetime.fromtimestamp(event["time"], tz=timezone.utc).isoformat(
        timespec="seconds"
    )
