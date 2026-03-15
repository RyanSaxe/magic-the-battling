#!/bin/sh
set -eu

if [ "${MTB_RUN_DB_MAINTENANCE_ON_STARTUP:-1}" = "1" ]; then
  uv run python scripts/maintain_db.py --apply
fi

exec uv run uvicorn server.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips "*"
