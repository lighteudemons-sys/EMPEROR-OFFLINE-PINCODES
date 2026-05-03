#!/bin/bash
cd /home/z/my-project
unset DATABASE_URL
export $(grep -v '^#' .env | xargs)
bun run dev
