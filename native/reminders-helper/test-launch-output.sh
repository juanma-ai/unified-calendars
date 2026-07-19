#!/bin/zsh

set -euo pipefail

root="${0:A:h}"
bundle="$root/.build/release/RemindersHelper.app"
output="$(mktemp -t reminders-helper-output).json"
trap 'rm -f "$output"' EXIT

open -W -n "$bundle" --args \
  --start 2026-07-01T00:00:00Z \
  --end 2026-08-01T00:00:00Z \
  --output "$output"

[[ -s "$output" ]] || { echo "Helper did not write its output file" >&2; exit 1; }
plutil -lint "$bundle/Contents/Info.plist" >/dev/null
python3 -c 'import json,sys; assert isinstance(json.load(open(sys.argv[1])), list)' "$output"
echo "LaunchServices output contract passed"
