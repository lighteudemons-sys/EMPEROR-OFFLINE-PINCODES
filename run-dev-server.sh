#!/bin/bash

# Kill any existing dev server
pkill -f "next dev" 2>/dev/null
sleep 2

# Set environment variables
cd /home/z/my-project
unset DATABASE_URL
export $(grep -v '^#' .env | xargs)

# Start dev server
bun run dev
