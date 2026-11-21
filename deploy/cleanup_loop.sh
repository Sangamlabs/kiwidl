#!/bin/bash
# KiwiAPI temporary file cleaner (30-minute retention)
while true; do
    sleep 300
    find /var/lib/kiwiapi/tmp -mindepth 1 -mmin +30 -delete 2>/dev/null || true
done
