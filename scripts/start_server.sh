#!/bin/sh
set -eu

if [ "${MTB_RUN_DB_MAINTENANCE_ON_STARTUP:-1}" = "1" ]; then
  # Maintenance only compacts old snapshots. The server reads them either way and sets aside any
  # game it cannot restore, so a maintenance failure is reported but must not keep the server down.
  uv run python scripts/maintain_db.py --apply || echo "DB maintenance exited with status $?; starting the server anyway" >&2
fi

exec uv run uvicorn server.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips "*"
