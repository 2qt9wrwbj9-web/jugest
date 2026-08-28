#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  echo "Run as root: sudo bash vps/configure-host.sh relay.example.com" >&2
  exit 1
fi

HOSTNAME_ARG=${1:-}
if [[ -z "$HOSTNAME_ARG" || "$HOSTNAME_ARG" == *"/"* || "$HOSTNAME_ARG" == *":"* || "$HOSTNAME_ARG" == *" "* ]]; then
  echo "Usage: sudo bash vps/configure-host.sh relay.example.com" >&2
  exit 2
fi

REPO_DIR=/opt/jugest
DATA_DIR=/var/lib/jugest-relay
SERVICE_SRC="$REPO_DIR/vps/jugest-relay.service"
CADDY_TEMPLATE="$REPO_DIR/vps/Caddyfile.example"

if [[ ! -f "$REPO_DIR/vps/relay-server.mjs" || ! -f "$REPO_DIR/relay-bridge.html" ]]; then
  echo "Expected the jugest repository at $REPO_DIR" >&2
  exit 3
fi
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed" >&2
  exit 4
fi
NODE_MAJOR=$(node -p "Number(process.versions.node.split('.')[0])")
if (( NODE_MAJOR < 20 )); then
  echo "Node.js 20+ is required; found $(node -v)" >&2
  exit 4
fi
if ! command -v caddy >/dev/null 2>&1; then
  echo "Caddy is not installed" >&2
  exit 5
fi

if ! id jugest >/dev/null 2>&1; then
  useradd --system --home /nonexistent --shell /usr/sbin/nologin jugest
fi
install -d -o jugest -g jugest -m 0750 "$DATA_DIR"
install -m 0644 "$SERVICE_SRC" /etc/systemd/system/jugest-relay.service
sed "s/relay\.example\.com/${HOSTNAME_ARG}/g" "$CADDY_TEMPLATE" > /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile

systemctl daemon-reload
systemctl enable --now jugest-relay.service
systemctl enable --now caddy.service
systemctl restart jugest-relay.service
systemctl reload caddy.service

for _ in {1..20}; do
  if curl -fsS http://127.0.0.1:8787/healthz >/dev/null; then break; fi
  sleep 1
done
curl -fsS http://127.0.0.1:8787/healthz

echo
for _ in {1..24}; do
  if curl -fsS "https://${HOSTNAME_ARG}/healthz" >/dev/null 2>&1; then break; fi
  sleep 5
done
curl -fsS "https://${HOSTNAME_ARG}/healthz"
curl -fsS "https://${HOSTNAME_ARG}/relay-bridge.html" | grep -q "juggler-relay-bridge-ready"

echo
echo "VPS Relay ready: https://${HOSTNAME_ARG}"
echo "Next: run the repository relay cutover dry-run, then --write only after the live checks above pass."
