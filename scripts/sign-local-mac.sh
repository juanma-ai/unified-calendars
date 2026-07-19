#!/bin/zsh

set -euo pipefail

app="${1:-release/mac-arm64/Unified Calendar.app}"

[[ -d "$app" ]] || { echo "Missing packaged app: $app" >&2; exit 1; }

codesign --force --deep --sign - "$app"
codesign --verify --deep --strict "$app"
echo "Local signature verified: $app"
