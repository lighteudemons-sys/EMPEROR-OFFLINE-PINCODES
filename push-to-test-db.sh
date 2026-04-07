#!/bin/bash

# Script to push Prisma schema to test environment (Neon/Vercel)
# Usage: ./push-to-test-db.sh

set -e

echo "🚀 Pushing Prisma schema to test environment (Neon)..."
echo ""

# Test environment database URLs
NEON_DB_URL="postgresql://neondb_owner:npg_jR2nVQDJXG8O@ep-nameless-flower-alam3jmb-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
ACCELERATE_URL="prisma://accelerate.prisma-data.net/?api_key=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqd3RfaWQiOjEsInNlY3VyZV9rZXkiOiJza19WVlYzaktrbUdYSi1ZMTRDUjZPQU4iLCJhcGlfa2V5IjoiMDFLS01HNlhHSktHUlIzOU1NVDJBNTc0R1kiLCJ0ZW5hbnRfaWQiOiIyODczNDMwNzJjYWExMGU1YTY1ZmNkMmUzYjg2ZTlkZTVjYWU0YWMzZDVlNGY3YzMzNThjNGJjODEwMGM5OTJhIiwiaW50ZXJuYWxfc2VjcmV0IjoiZTc2ZjZjZGMtMmJhMi00MzBmLWEwNGEtNGZjZGE3YTNlMjc0In0.qJmtwJTwdsV7qNCi8CTdF3Aj9dWJeNYIlAV-_8kFtFc"

# Backup local .env
if [ -f .env ]; then
    cp .env .env.local.backup
    echo "✅ Backed up local .env file"
fi

# Create temporary .env with test URLs
cat > .env << EOF
DATABASE_URL="$NEON_DB_URL"
PRISMA_ACCELERATE_URL="$ACCELERATE_URL"
EOF

echo "📝 Created temporary .env with test environment URLs"
echo ""

# Push schema
bun prisma db push

# Restore local .env
if [ -f .env.local.backup ]; then
    mv .env.local.backup .env
    echo ""
    echo "✅ Restored local .env file"
fi

echo ""
echo "✅ Schema successfully pushed to test environment!"
echo ""
echo "Test Database: Neon (ep-nameless-flower-alam3jmb-pooler.c-3.eu-central-1.aws.neon.tech)"
echo "Accelerate: Prisma Accelerate enabled"
