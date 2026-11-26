#!/usr/bin/env bash
# View a Pi session in vibeview:
#   ./start.sh path/to/session.jsonl [extra 'vibeview web' flags, e.g. --port 4882]
# Converts the session into a temporary folder, serves it, and opens the browser.
# Ctrl+C stops the viewer and deletes the temporary folder.
set -euo pipefail

if [[ $# -lt 1 ]]; then
    echo "usage: $0 path/to/session.jsonl [vibeview web flags]" >&2
    exit 2
fi

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
binary="$repo/apps/cli/vibeview"
if [[ ! -x "$binary" ]]; then
    echo "$binary not found: run 'make build' in $repo first" >&2
    exit 1
fi

view="$(cd "$(mktemp -d)" && pwd -P)"
trap 'rm -rf "$view"' EXIT

uv run "$repo/scripts/pi_to_vibeview.py" "$1" "$view/session.jsonl"
"$binary" --claude-dir "$view" web --open "${@:2}" "$view/session.jsonl"
