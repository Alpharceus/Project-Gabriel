# Fedora install runbook

```bash
# 1. Get the code (git pull is the deploy from then on)
git clone https://github.com/Alpharceus/Project-Gabriel.git ~/src/gabriel

# 2. Venv + editable install
python3 -m venv ~/.venvs/gabriel
~/.venvs/gabriel/bin/pip install -e ~/src/gabriel

# 3. Config — same topic as the other machines, src differs
mkdir -p ~/.config/gabriel
cat > ~/.config/gabriel/config.toml <<'EOF'
server = "https://ntfy.sh"
topic = "<the group topic — copy from the win config, never commit it>"
src = "fedora"
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

The send should buzz the phone (title "fedora") and land in the Windows DB;
it must NOT appear in Fedora's own inbound log (self-drop).
