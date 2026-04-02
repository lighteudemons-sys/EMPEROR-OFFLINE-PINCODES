#!/bin/bash
# Startup script for dev server with Neon DATABASE_URL

# Set DATABASE_URL to Neon PostgreSQL
export DATABASE_URL="postgresql://neondb_owner:npg_jR2nVQDJXG8O@ep-nameless-flower-alam3jmb-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"

# Start the dev server
bun run dev
