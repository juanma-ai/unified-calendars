#!/bin/zsh

set -euo pipefail

root="${0:A:h}"
configuration="release"
build_dir="$root/.build/$configuration"
bundle="$build_dir/RemindersHelper.app"
contents="$bundle/Contents"

cd "$root"
swift build -c "$configuration"

rm -rf "$bundle"
mkdir -p "$contents/MacOS"
cp "$build_dir/RemindersHelper" "$contents/MacOS/RemindersHelper"
cp "$root/Sources/RemindersHelper/Info.plist" "$contents/Info.plist"

/usr/libexec/PlistBuddy -c 'Add :CFBundleExecutable string RemindersHelper' "$contents/Info.plist"
/usr/libexec/PlistBuddy -c 'Add :CFBundlePackageType string APPL' "$contents/Info.plist"

codesign --force --sign - "$bundle"
zsh "$root/test-app-bundle.sh" "$bundle"
