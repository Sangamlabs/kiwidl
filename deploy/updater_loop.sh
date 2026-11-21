#!/bin/bash
# KiwiAPI dependencies daily updater
while true; do
    sleep 86400
    /opt/kiwiapi/api/venv/bin/pip install -U yt-dlp gallery-dl shazamio 2>&1 || true
done
