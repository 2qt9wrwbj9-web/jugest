#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "run as root (sudo)" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VPS_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if ! id jugest >/dev/null 2>&1; then
  echo "jugest service user does not exist" >&2
  exit 1
fi

mkdir -p /var/lib/jugest/collector/raw
chown jugest:jugest /var/lib/jugest
chown jugest:jugest /var/lib/jugest/collector
chown jugest:jugest /var/lib/jugest/collector/raw
chmod 0700 /var/lib/jugest/collector/raw

install -m 0644 "$VPS_ROOT/systemd/jugest-collector.service" /etc/systemd/system/jugest-collector.service
install -m 0644 "$VPS_ROOT/systemd/jugest-collector.timer" /etc/systemd/system/jugest-collector.timer

systemctl daemon-reload

echo "Installed jugest-collector.service and jugest-collector.timer."
echo "Collector timer remains disabled. Enable it only after canary approval."
echo "Existing /etc/jugest/jugest.env was not modified."
