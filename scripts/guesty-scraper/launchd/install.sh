#!/usr/bin/env bash
# Install (or reinstall) the every-15-min Guesty scrape-all launchd
# job on Ishant's Mac. Idempotent — safe to re-run.
#
# What it does:
#   1. Copies the plist to ~/Library/LaunchAgents
#   2. Unloads any existing job with the same label (so timers reset)
#   3. Loads the new plist
#   4. Verifies it's registered
#
# Stop with:  scripts/guesty-scraper/launchd/uninstall.sh

set -e

cd "$(dirname "$0")"
SRC_PLIST="com.friday.guesty-scrape-all.plist"
TARGET_DIR="$HOME/Library/LaunchAgents"
TARGET_PLIST="$TARGET_DIR/$SRC_PLIST"

if [ ! -f "$SRC_PLIST" ]; then
  echo "✗ Missing $SRC_PLIST in $(pwd)"
  exit 1
fi

mkdir -p "$TARGET_DIR"

# Tear down the existing job (if any) so the new plist's interval timer
# starts cleanly. Errors are non-fatal — launchctl errors when the
# label isn't loaded.
launchctl unload "$TARGET_PLIST" 2>/dev/null || true

cp "$SRC_PLIST" "$TARGET_PLIST"
launchctl load -w "$TARGET_PLIST"

# Sanity check
if launchctl list | grep -q com.friday.guesty-scrape-all; then
  echo "✓ Installed: com.friday.guesty-scrape-all"
  echo "  Interval: 15 minutes"
  echo "  Log:      ~/Library/Logs/guesty-scrape-all.log"
  echo "  Tail with: tail -f ~/Library/Logs/guesty-scrape-all.log"
  echo
  echo "First scheduled run is ~15 minutes from now. To trigger NOW:"
  echo "  launchctl kickstart -k gui/\$(id -u)/com.friday.guesty-scrape-all"
else
  echo "✗ Job did not register — check 'launchctl list' for errors"
  exit 1
fi
