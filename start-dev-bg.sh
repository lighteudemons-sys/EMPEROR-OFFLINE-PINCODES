#!/bin/bash
cd /home/z/my-project
export DATABASE_URL="postgresql://neondb_owner:npg_jR2nVQDJXG8O@ep-nameless-flower-alam3jmb-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
nohup ./node_modules/.bin/next dev -p 3000 > /tmp/next-dev-bg.log 2>&1 &
echo $! > /tmp/next-dev.pid
echo "Dev server started with PID: $(cat /tmp/next-dev.pid)"
