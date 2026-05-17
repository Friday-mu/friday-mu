#!/usr/bin/env bash
# Stop the every-15-min Guesty scrape-all launchd job. Idempotent.
set -e
TARGET_PLIST="$HOME/Library/LaunchAgents/com.friday.guesty-scrape-all.plist"
if [ -f "$TARGET_PLIST" ]; then
  launchctl unload "$TARGET_PLIST" 2>/dev/null || true
  rm -f "$TARGET_PLIST"
  echo "✓ Uninstalled com.friday.guesty-scrape-all"
else
  echo "Job not installed (no plist at $TARGET_PLIST)"
fi
