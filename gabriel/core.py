"""Gabriel core v3: send() and receive_loop() over Firebase.

Firestore is the bus and the permanent archive; FCM pushes to registered
devices; everything in Firestore is E2E-encrypted (see crypto.py).

Library boundary rules: nothing here imports cli, prints, or touches
sys.argv. No platform conditionals.

Firestore layout:
  messages/{id}: {v: 3, id, ts, n, ct, sts: <server timestamp>}
  devices/{token}: {token, name, updated}   # FCM push targets (the PWA)
"""

import logging
import threading
import time
import uuid
from datetime import datetime, timezone

import firebase_admin
from firebase_admin import credentials as fb_credentials
from firebase_admin import firestore, messaging

from . import config, crypto, store

log = logging.getLogger("gabriel")

MESSAGES = "messages"
DEVICES = "devices"


def _client(cfg: config.Config):
    if not firebase_admin._apps:
        firebase_admin.initialize_app(
            fb_credentials.Certificate(str(cfg.credentials)),
            {"projectId": cfg.project},
        )
    return firestore.client()


def send(body: str, kind: str = "text", src: str | None = None) -> str:
    """Encrypt and publish to the group. Returns the message id.

    Raises if the Firestore write fails; push fan-out failures are logged,
    not raised — the message is durable once written. `src=None` falls back
    to config; the override is how agents label themselves.
    """
    cfg = config.load()
    src = src or cfg.src
    msg_id = str(uuid.uuid4())
    ts = datetime.now(timezone.utc).isoformat(timespec="seconds")
    payload = {"src": src, "kind": kind, "body": body}
    nonce, ct = crypto.encrypt(cfg.key, msg_id, payload)

    db = _client(cfg)
    db.collection(MESSAGES).document(msg_id).set({
        "v": 3, "id": msg_id, "ts": ts, "n": nonce, "ct": ct,
        "sts": firestore.SERVER_TIMESTAMP,
    })
    store.insert(cfg.db, {"id": msg_id, "ts": ts, **payload}, direction="out")

    try:
        _push(db, {"id": msg_id, "ts": ts, "n": nonce, "ct": ct})
    except Exception:
        log.exception("push fan-out failed (message is still delivered)")
    return msg_id


def _push(db, data: dict) -> None:
    """FCM data-message fan-out to every registered device; the receiving
    service worker decrypts and renders the notification. Dead tokens are
    pruned."""
    tokens = [d.id for d in db.collection(DEVICES).stream()]
    if not tokens:
        return
    resp = messaging.send_each(
        [messaging.Message(token=t, data=data) for t in tokens]
    )
    for token, r in zip(tokens, resp.responses):
        if r.exception and isinstance(
            r.exception, messaging.UnregisteredError
        ):
            db.collection(DEVICES).document(token).delete()
            log.info("pruned dead device token %s…", token[:12])
        elif r.exception:
            log.warning("push to %s… failed: %s", token[:12], r.exception)


def _age_seconds(ts: str) -> float:
    try:
        return abs((datetime.now(timezone.utc)
                    - datetime.fromisoformat(ts)).total_seconds())
    except ValueError:
        return float("inf")


def receive_loop() -> None:
    """Mirror the Firestore archive into the local DB, forever.

    The snapshot listener replays the whole collection on (re)connect;
    INSERT OR IGNORE makes that idempotent — and doubles as free catch-up
    for anything missed while the machine slept.
    """
    cfg = config.load()
    db = _client(cfg)
    wake = threading.Event()

    def on_snapshot(snapshot, changes, read_time):
        for change in changes:
            if change.type.name not in ("ADDED", "MODIFIED"):
                continue
            doc = change.document.to_dict()
            try:
                payload = crypto.decrypt(cfg.key, doc["id"], doc["n"], doc["ct"])
            except Exception:
                log.warning("undecryptable message %s (wrong key?)", doc.get("id"))
                continue
            direction = "out" if payload["src"] == cfg.src else "in"
            fresh = store.insert(cfg.db, {"id": doc["id"], "ts": doc["ts"], **payload},
                                 direction)
            if fresh and direction == "in":
                log.info("in: %s: %s", payload["src"], payload["body"][:120])
            # Relay push: web-client sends can't do FCM fan-out themselves
            # (that needs admin credentials), so the receiver pushes on their
            # behalf. Notification tag = id dedupes against sender-side pushes;
            # the age gate stops replay storms after downtime.
            if fresh and _age_seconds(doc["ts"]) < 120:
                try:
                    _push(db, {"id": doc["id"], "ts": doc["ts"],
                               "n": doc["n"], "ct": doc["ct"]})
                except Exception:
                    log.exception("relay push failed for %s", doc["id"])

    log.info("watching %s/%s (src=%s)", cfg.project, MESSAGES, cfg.src)
    watch = db.collection(MESSAGES).on_snapshot(on_snapshot)
    try:
        while not wake.wait(60):
            pass  # SDK handles reconnects; we just stay alive
    finally:
        watch.unsubscribe()
