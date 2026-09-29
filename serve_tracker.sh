#!/bin/sh
# Serves tracker.html and job_search_tracker.csv over local HTTP so the
# Digest console (ticket 04 in the Agentic_OS repo) can embed the tracker
# in an <iframe>. Fixed port 8090 - chosen to avoid the console (18443)
# and the Agentic_OS write-path shim (8765).
cd "$(dirname "$0")" && exec python3 -m http.server 8090
