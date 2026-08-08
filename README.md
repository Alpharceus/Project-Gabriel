# Gabriel

A group chat for one person's devices and agents, over one shared ntfy topic.
(Design/phasing doc kept off-repo.)

## Install (any machine)

```
git clone <repo-url>
pip install -e .
```

Config lives at `~/.config/gabriel/config.toml` (never committed):

```toml
server = "https://ntfy.sh"
topic = "<the shared group topic>"
src = "win"   # this machine's name: win | fedora | ...
# db = "<optional custom DB path>"
```

## Use

```
gabriel send hello everyone
gabriel send https://example.com --kind url
gabriel log -n 20        # the chat view
gabriel recv             # receiver loop, foreground
```

Library: `gabriel.send(body, kind="text", src=None) -> msg_id`.

## Autostart

- Windows: `deploy/windows/register-task.ps1` (at-logon Task Scheduler task).
- Fedora: `deploy/fedora/README.md` (systemd user unit).
- Phone: no code — the ntfy Android app subscribed to the topic.
