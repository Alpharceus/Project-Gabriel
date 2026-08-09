# Project Gabriel 📯

**A group chat for one person — every device and agent you own, posting to one feed.**

Gabriel puts your desktop, your laptop, your phone, and your automations in a
single conversation. Share a link from the phone and it lands in a SQLite
archive on every PC within seconds; fire one Python call from a script or an
agent and your phone buzzes with the sender's name on the notification. There
is no server to run, no account to create, and **zero code on the phone** —
the hub is a single secret [ntfy](https://ntfy.sh) topic, and the phone's
client is the ntfy app plus a single-file web page.

## Architecture

```
                     +----------------------+
                     |       ntfy.sh        |    rented hub — always on,
                     |   one secret topic   |    nothing self-hosted
                     +----------------------+
                        ^       ^        ^
                        |  HTTPS pub/sub |
                        |       |        |
        +----------+  +----------+  +-------------+
        |   win    |  |  fedora  |  |    phone    |
        | receiver |  | receiver |  |  ntfy app   |
        | + SQLite |  | + SQLite |  |  + web UI   |
        +----------+  +----------+  +-------------+
              ^
              |  import gabriel; gabriel.send("...", src="my-agent")
        +---------------------------+
        |  agents (send-only)       |
        |  tool calls, MCP servers  |
        +---------------------------+
```

- **The topic is the group.** Every participant publishes to one ntfy topic and
  subscribes to the same one. No routing, no rooms, no threads — every device
  sees every message, so every archive converges toward complete history.
- **Full participants** (the PCs) run a small receiver daemon that logs
  everything it sees into a local SQLite archive.
- **Send-only participants** (scripts, agents, an MCP server on a Pi) just call
  `gabriel.send()` with a `src` override. No receiver, no state, no daemon.
- **The phone** is the ntfy Android app (push, tappable links, share-sheet
  sending) plus `web/chat.html` for a proper chat view.

## What it does

- **`send()` is the whole API.** `gabriel.send(body, kind="text", src=None)`
  posts an enveloped message and returns its id. Raises on failure; no retry
  queue, no hidden state — callers decide. `kind="url"` makes the phone
  notification tappable straight to the link.
- **Sender identity in the notification.** The envelope's `src` ("win",
  "fedora", "my-agent") rides the ntfy `Title` header, so the phone shows *who*
  is talking before you even open it.
- **Per-machine history.** Each receiver logs every message — inbound and its
  own echoes — into one SQLite table, deduped by message id, so reconnects and
  overlapping catch-ups can't double-log. `gabriel log` is the chat view.
- **Bare text just works.** Messages sent from the ntfy app (share sheet or
  in-app compose) arrive as raw text; receivers wrap them as phone messages.
  One try/except, no phone-side changes.
- **A receiver that assumes the network lies.** The stream subscription treats
  silence as death (read timeout past ntfy's keepalive) and reconnects forever
  — sleep, suspend, and Wi-Fi blips are recoverable, not fatal.
- **A chat page with no backend.** `web/chat.html` is one self-contained file:
  it polls ntfy's cache for history, streams live messages over SSE, renders
  envelope-aware chat bubbles (dark/light), and composes proper envelopes.
  Host it on any static host — the secret topic never touches the page or any
  server; it lives in the URL hash and your browser's localStorage.

## Install

```
git clone https://github.com/Alpharceus/Project-Gabriel.git
pip install -e Project-Gabriel
```

Each machine gets `~/.config/gabriel/config.toml` (gitignored territory —
machines differ only in `src`):

```toml
server = "https://ntfy.sh"
topic = "<the shared secret topic>"
src = "win"          # this machine's name in the chat
# db = "<custom archive path>"   # optional
```

Everything is env-overridable (`GABRIEL_TOPIC`, `GABRIEL_SRC`, …) for one-off
runs and send-only installs.

## Use

```
gabriel send hello everyone            # text to the group
gabriel send https://example.com --kind url
gabriel log -n 20                      # the chat view: time, sender, body
gabriel recv                           # receiver loop, foreground
```

From code — this is the entire agent integration surface:

```python
import gabriel
gabriel.send("build finished ✅", src="ci")
```

## Autostart

- **Windows:** `deploy/windows/register-task.ps1` — at-logon Task Scheduler
  task running `pythonw`, restart-on-failure, no console window.
- **Linux:** `deploy/fedora/README.md` — systemd user unit
  (`loginctl enable-linger` for pre-login start).
- **Phone:** nothing to start. Subscribe the ntfy app to the topic and exempt
  it from battery optimization.

## Design stance

- **Rent the hub, don't build it.** ntfy.sh is the always-on piece; migrating
  to a self-hosted ntfy is a config edit on each machine, never a code change.
- **The topic name is the password.** No accounts, no tokens — right-sized for
  one person's trust boundary. Corollary: never send anything you wouldn't
  mind being public, and rotate the topic if it ever leaks.
- **A new participant is a config value, not a release.** `src` is a free
  string; an agent joins the chat by passing one keyword argument.
- **Library first.** `gabriel/core.py` never prints, never touches `sys.argv`,
  and imports nothing platform-specific; the CLI is a zero-logic wrapper.
  If an integration ever needs a Gabriel code change, the boundary is wrong.

## Non-goals

No rooms or threads, no delivery receipts, no E2E encryption, no retry queues,
no file transfer, no phone-side code. Known limits: ntfy.sh's free tier caches
~12 hours (a machine asleep longer misses those messages until a future
catch-up feature) and allows 250 messages/day — personal-scale on purpose.
