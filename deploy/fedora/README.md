# Fedora install runbook (v3, Firebase)

Bring over on a flash drive (never through git): the two secrets —
`config.toml` values and `serviceAccount.json`.

```bash
# 1. Get the code (git pull is the deploy from then on)
git clone https://github.com/Alpharceus/Project-Gabriel.git ~/src/gabriel

# 2. Venv + editable install
python3 -m venv ~/.venvs/gabriel
~/.venvs/gabriel/bin/pip install -e ~/src/gabriel

# 3. Config — same key/project as the other machines, src differs
mkdir -p ~/.config/gabriel
cp /path/to/flashdrive/serviceAccount.json ~/.config/gabriel/
cat > ~/.config/gabriel/config.toml <<'EOF'
src = "fedora"
key = "<copy from the win config — the shared E2E key>"
project = "project-gabriel-92f4"
credentials = "~/.config/gabriel/serviceAccount.json"
EOF

# 4. Autostart (systemd user unit)
mkdir -p ~/.config/systemd/user
cp ~/src/gabriel/deploy/fedora/gabriel.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now gabriel.service

# 5. If it must run without an open session (e.g. after reboot, before login):
loginctl enable-linger $USER
```

Verify:

```bash
systemctl --user status gabriel.service     # active (running)
~/.venvs/gabriel/bin/gabriel send hello from fedora
~/.venvs/gabriel/bin/gabriel log            # chat view
journalctl --user -u gabriel.service -f     # receiver log
```

The send should buzz the phone (title "fedora") and appear in the win DB and
web app; Fedora's own receiver archives it as outbound, not inbound.

For the chat UI on Fedora: open the hosted PWA in Chromium, use the
`#k=<key>&s=fedora` setup link, and install from the browser menu.
