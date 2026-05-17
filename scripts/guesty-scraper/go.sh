#!/usr/bin/env bash
# One-shot setup + run for the Guesty scraper.
# Idempotent — re-run any time. First run installs everything and
# opens a browser for you to log in; subsequent runs just scrape.

set -e
cd "$(dirname "$0")"

if [ ! -d node_modules ]; then
  echo "→ Installing deps…"
  npm install --silent
fi

# Check that Chromium is actually installed by playwright. The marker
# is the per-user playwright cache directory.
if [ ! -d "$HOME/Library/Caches/ms-playwright" ] || \
   [ -z "$(find "$HOME/Library/Caches/ms-playwright" -maxdepth 1 -name 'chromium-*' 2>/dev/null)" ]; then
  echo "→ Installing Chromium…"
  npx playwright install chromium
fi

if [ ! -d .profile ]; then
  echo "→ First run: opening a browser. Log in to Guesty via Google SSO,"
  echo "  navigate to the inbox to confirm it loads, then CLOSE the browser."
  npm run auth
  echo "→ Session saved. Running scrape now…"
fi

echo "→ Scraping…"
npm run scrape
