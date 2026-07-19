#!/bin/zsh

set -euo pipefail

bundle="${1:-.build/release/RemindersHelper.app}"
plist="$bundle/Contents/Info.plist"
executable="$bundle/Contents/MacOS/RemindersHelper"

[[ -d "$bundle" ]] || { echo "Missing app bundle: $bundle" >&2; exit 1; }
[[ -x "$executable" ]] || { echo "Missing executable: $executable" >&2; exit 1; }
[[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$plist")" == \
  "com.juanmagarrido.calendar-personal-app.reminders-helper" ]] || exit 1
[[ -n "$(/usr/libexec/PlistBuddy -c 'Print :NSRemindersFullAccessUsageDescription' "$plist")" ]] || exit 1

codesign --verify --strict "$bundle"
echo "RemindersHelper.app bundle contract passed"
