#!/bin/bash
# Wrapper to start the Next.js dev server with the correct DATABASE_URL.
#
# SECURITY: This script reads DATABASE_URL from the .env file (or the
# environment) and NEVER hardcodes credentials. The .env file is gitignored
# and should never be committed.
#
# The shell environment provided by some sandboxes contains an old SQLite URL
# which would shadow the Neon URL in .env, so we explicitly load .env first.

set -e

# Load .env if it exists (this is the only place credentials are read from)
if [ -f /home/z/my-project/.env ]; then
  set -a
  . /home/z/my-project/.env
  set +a
fi

if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL is not set."
  echo "Create a .env file with DATABASE_URL=... (see .env.example for the template)."
  exit 1
fi

# Detach completely from this shell so the dev server survives the bash
# tool session ending.
nohup setsid env DATABASE_URL="$DATABASE_URL" \
  bash -c 'cd /home/z/my-project && exec ./node_modules/.bin/next dev -p 3000' \
  > /tmp/dev-server.log 2>&1 < /dev/null &
disown

echo "Dev server started in detached session"
echo "PID: $!"
echo "Log: /tmp/dev-server.log"
