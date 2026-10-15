#!/usr/bin/env bash
# Install the daily outreach reminder as a launchd job. Every morning it runs
# `tools/outreach.py notify`, which posts a desktop notification when a drafted
# message is due and stays silent otherwise. It reads outreach_queue.csv and
# nothing else: the tool has no way to send a message, and that is the point
# (09-referral-outreach.md, hard rule 2).
#
# Uses /usr/bin/python3 directly: the tool is stdlib-only, so launchd's minimal
# PATH is not a problem here the way it is for jobs that shell out.
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLIST="$HOME/Library/LaunchAgents/com.aijobsearch.outreach.plist"
HOUR="${OUTREACH_HOUR:-9}"
MINUTE="${OUTREACH_MINUTE:-30}"
mkdir -p "$REPO/state/logs"

cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.aijobsearch.outreach</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/bin/python3</string>
        <string>${REPO}/tools/outreach.py</string>
        <string>notify</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${REPO}</string>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>${HOUR}</integer>
        <key>Minute</key>
        <integer>${MINUTE}</integer>
    </dict>
    <key>RunAtLoad</key>
    <false/>
    <key>StandardOutPath</key>
    <string>${REPO}/state/logs/outreach.out.log</string>
    <key>StandardErrorPath</key>
    <string>${REPO}/state/logs/outreach.err.log</string>
</dict>
</plist>
PLIST

launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
echo "installed and loaded: $PLIST"
echo "reminder runs daily at $(printf '%02d:%02d' "$HOUR" "$MINUTE"); silent when nothing is due"
echo "try it now: python3 $REPO/tools/outreach.py notify"
