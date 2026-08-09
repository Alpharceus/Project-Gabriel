"""End-to-end encryption for Gabriel v3 (Firebase backend).

Scheme: AES-256-GCM with one pre-shared key across all of one person's
devices — every endpoint is trusted, so key agreement protocols buy nothing.
The encrypted payload is the JSON dict {"src", "kind", "body"}; the message
id is bound in as AAD so a ciphertext can't be replayed under another id.
Firestore only ever sees {id, ts, nonce, ciphertext}.

Wire format (matches app/crypto.js in the web client — keep in sync):
  key:   32 bytes, base64url (no padding) in config
  nonce: 12 random bytes, standard base64 in the message doc
  ct:    AES-GCM ciphertext + 16-byte tag, standard base64
"""

import base64
import json
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

_NONCE_LEN = 12


def generate_key() -> str:
    """New 256-bit key, base64url without padding (config-friendly)."""
    return base64.urlsafe_b64encode(os.urandom(32)).decode().rstrip("=")


def _load_key(key_b64: str) -> bytes:
    pad = "=" * (-len(key_b64) % 4)
    key = base64.urlsafe_b64decode(key_b64 + pad)
    if len(key) != 32:
        raise ValueError("gabriel key must be 32 bytes (use `gabriel keygen`)")
    return key


def encrypt(key_b64: str, msg_id: str, payload: dict) -> tuple[str, str]:
    """Returns (nonce_b64, ct_b64) for the payload dict."""
    nonce = os.urandom(_NONCE_LEN)
    ct = AESGCM(_load_key(key_b64)).encrypt(
        nonce,
        json.dumps(payload, separators=(",", ":")).encode(),
        msg_id.encode(),
    )
    return base64.b64encode(nonce).decode(), base64.b64encode(ct).decode()


def decrypt(key_b64: str, msg_id: str, nonce_b64: str, ct_b64: str) -> dict:
    """Inverse of encrypt(). Raises on tampering or a wrong key."""
    pt = AESGCM(_load_key(key_b64)).decrypt(
        base64.b64decode(nonce_b64),
        base64.b64decode(ct_b64),
        msg_id.encode(),
    )
    return json.loads(pt)
