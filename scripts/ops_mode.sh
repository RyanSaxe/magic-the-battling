#!/bin/sh
# Usage: scripts/ops_mode.sh MODE [MESSAGE]
# Sets the server's ops mode (normal, draining or maintenance) through POST /api/ops/mode.
# Needs APP_BASE_URL, OPS_API_TOKEN and OPS_UPDATED_BY in the environment.
set -eu
: "${APP_BASE_URL?APP_BASE_URL must be set}" "${OPS_API_TOKEN?OPS_API_TOKEN must be set}" "${OPS_UPDATED_BY?OPS_UPDATED_BY must be set}"

mode=$1
message=${2:-}
payload=$(python3 -c 'import json, sys; print(json.dumps({"mode": sys.argv[1], "message": sys.argv[2], "updated_by": sys.argv[3]}))' \
  "$mode" "$message" "$OPS_UPDATED_BY")
response=$(mktemp)
trap 'rm -f "$response"' EXIT

# A machine that has just been deployed can refuse connections or answer 502 while it boots, which can
# take most of a minute when the server fetches cube metadata at startup. The time limits keep the
# retries inside the workflow step's two-minute timeout.
status=$(curl --silent --show-error --retry 12 --retry-delay 5 --retry-all-errors --max-time 10 --retry-max-time 90 \
  --output "$response" --write-out '%{http_code}' \
  -X POST "$APP_BASE_URL/api/ops/mode" \
  -H 'Content-Type: application/json' \
  -H "x-ops-token: $OPS_API_TOKEN" \
  -d "$payload") || {
  echo "Failed to reach the ops mode endpoint." >&2
  cat "$response" >&2
  exit 1
}

case "$status" in
  200)
    echo "Server is in $mode mode."
    ;;
  401|403|404|405|503)
    echo "Ops mode unavailable (HTTP $status); continuing without setting $mode mode."
    cat "$response"
    ;;
  *)
    echo "Unexpected status from the ops mode endpoint: $status" >&2
    cat "$response" >&2
    exit 1
    ;;
esac
