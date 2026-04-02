#!/bin/bash
cd /home/z/my-project
while true; do
  echo "Starting dev server at $(date)" >> dev.log
  bun run dev >> dev.log 2>&1
  echo "Dev server stopped at $(date), restarting in 5 seconds..." >> dev.log
  sleep 5
done
