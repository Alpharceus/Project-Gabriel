# Project Gabriel 📯

**A group chat for one person — every device and agent you own, in one end-to-end encrypted feed.**

Gabriel puts your desktop, your laptop, your phone, and your automations in a
single conversation. Send from any of them and the rest light up: a real
notification with the sender's name, a permanent archive nothing can expire,
and a chat view that installs like an app on every platform — **without
building a native app for any of them**. Messages are AES-256-GCM encrypted on
the sending device and decrypted on the receiving one; the cloud in the middle
stores ciphertext and nothing else.

## Architecture

```
                      +---------------------------+
                      |         Firebase          |
                      |  Firestore = the bus and  |   holds ciphertext only:
                      |  the permanent archive    |   {id, ts, nonce, ct}
                      |  FCM = push notifications |
                      +---------------------------+
                        ^        ^         ^
                        |  writes + live listeners
                        |        |         |
      +-----------+   +-----------+   +-----------------+
      |    win    |   |  fedora   |   |      phone      |
      | receiver  |   | receiver  |   |  installed PWA  |
      | + SQLite  |   | + SQLite  |   |  (no app store) |
      | + relay --+---+-----------+-->|  push + chat UI |
      +-----------+   +-----------+   +-----------------+
            ^
            |  import gabriel; gabriel.send("...", src="my-agent")
      +---------------------------+
      |  agents (send-only)       |
      |  tool calls, MCP servers  |
      +---------------------------+
```

- **Firestore is the bus and the archive.** Every message is one append-only
  document; history is permanent and readable from any device at any time — no
  machine has to be awake for another to catch up.
- **One key, all your devices.** E2E is a single pre-shared AES-256-GCM key
  (`gabriel keygen`): when every endpoint is one person's, key-agreement
  protocols buy nothing. The message id rides along as AAD, so a ciphertext
  can't be replayed under a different identity. Python's `cryptography` and
  the browser's WebCrypto produce interchangeable ciphertext (test-verified).
- **Push without a server.** Library senders fan out FCM data-messages
  themselves; for web-client sends (browsers can't hold admin credentials),
  the PC receiver relays the push within a second. Notification tags dedupe
  the overlap; each device's service worker decrypts locally and skips its
  own messages. No Cloud Functions, no paid tier.
- **The client is one PWA.** A single static web app — chat bubbles, avatars,
  day dividers, dark/light — that installs from the browser on Android,
  Windows, and Linux alike. Setup is a one-time link (or QR) with the key in
  the URL fragment, which never leaves the device.
- **Full participants** (the PCs) run a small receiver that mirrors the
  archive into local SQLite; **send-only participants** (scripts, agents, an
  MCP server on a Pi) just call `gabriel.send()` with a `src` override.

## What it does

- **`send()` is the whole API.** `gabriel.send(body, kind="text", src=None)`
  encrypts, writes the archive, and pushes — one call, raises on failure, no
  hidden queues. `kind="url"` makes the notification tap straight to the link.
- **Sender identity everywhere.** The envelope's `src` ("win", "phone",
  "my-agent") titles the notification and labels the chat bubble, so a new
  participant is one keyword argument, not a release.
- **Per-machine history.** Receivers mirror every message into one SQLite
  table, deduped by id — reconnects and catch-up replays are idempotent, and
  sleeping through a message costs nothing (it's waiting in Firestore).
- **`gabriel log`** is the chat view from any terminal; **`gabriel recv`** is
  the receiver loop; **`gabriel keygen`** mints the shared key.
- **Locked down by default.** Firestore rules: authenticated user only,
  messages append-only — a compromised client can't rewrite history. One
  email/password account, sessions persist until explicit sign-out.

## Install

**A PC (full participant):**

```
git clone https://github.com/Alpharceus/Project-Gabriel.git
pip install -e Project-Gabriel
```

`~/.config/gabriel/config.toml` (never committed; machines differ only in `src`):

```toml
src = "win"                # this machine's name in the chat
key = "<gabriel keygen>"   # the shared E2E key
project = "<firebase project id>"
credentials = "~/.config/gabriel/serviceAccount.json"   # Admin SDK key
```

**The phone (or any device that just wants the app):** open the hosted PWA,
sign in, and install from the browser menu. A `#k=<key>&s=<name>` setup link
configures it without typing.

**Firebase (once, for your own deployment):** create a project, a Firestore
database, an Email/Password user, and a web-push key pair; `firebase deploy`
ships the rules and the app from this repo.

## Autostart

- **Windows:** `deploy/windows/register-task.ps1` — at-logon Task Scheduler
  task running `pythonw`, restart-on-failure, no console window.
- **Linux:** `deploy/fedora/README.md` — systemd user unit.
- **Phone:** nothing to run — FCM wakes the installed PWA's service worker.

## Design stance

- **Rent the hub, don't build it.** The always-on piece is Firebase's free
  tier; nothing self-hosted, nothing that sleeps.
- **The cloud is untrusted.** Everything readable leaves the device encrypted;
  Firestore stores `{id, ts, nonce, ciphertext}` and learns nothing else.
- **A new participant is a config value.** `src` is a free string; agents join
  the chat by passing one keyword argument to `send()`.
- **Library first.** `gabriel/core.py` never prints, never touches `sys.argv`,
  has no platform conditionals; the CLI is a zero-logic wrapper. If an
  integration needs a Gabriel code change, the boundary is wrong.
- **No native builds.** The PWA installs app-like on every OS from one static
  deploy — one codebase, no app stores, no signing keys, no SDKs.

## Non-goals

No rooms or threads, no delivery receipts, no retry queues, no file transfer.
Known trade-offs: web-client sends push via the PC relay (a sleeping relay
delays those notifications — library sends always push directly), and the
free tier's quotas are personal-scale on purpose.
