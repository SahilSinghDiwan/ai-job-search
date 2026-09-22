#!/usr/bin/env bash
# Install the tracker HTTP server as a persistent launchd job, so the
# Digest console's iframe (console/app/digest/page.tsx) always has something
# at 127.0.0.1:8090 to embed instead of needing serve_tracker.sh run by hand
# every session. Modeled on com.sahildiwan.agenticos.console.plist (same
# RunAtLoad + KeepAlive pattern), but scoped to this repo since the tracker
# isn't vault state.
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLIST="$HOME/Library/LaunchAgents/com.sahildiwan.aijobsearch.tracker.plist"
mkdir -p "$REPO/state/logs"

cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.sahildiwan.aijobsearch.tracker</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/sh</string>
        <string>${REPO}/serve_tracker.sh</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${REPO}</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${REPO}/state/logs/tracker.out.log</string>
    <key>StandardErrorPath</key>
    <string>${REPO}/state/logs/tracker.err.log</string>
</dict>
</plist>
PLIST

launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
echo "installed and loaded: $PLIST"
echo "tracker now persistent at http://127.0.0.1:8090/tracker.html"
