#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  echo "Run as root: sudo bash /opt/jugest/vps/update-relay.sh" >&2
  exit 1
fi

cd /opt/jugest
git fetch --depth=1 origin main
git reset --hard origin/main
node --check vps/relay-server.mjs
systemctl restart jugest-relay.service
for _ in {1..20}; do
  if curl -fsS http://127.0.0.1:8787/healthz >/dev/null; then
    curl -fsS http://127.0.0.1:8787/healthz
    echo
    exit 0
  fi
  sleep 1
done
journalctl -u jugest-relay.service -n 50 --no-pager >&2
exit 1
