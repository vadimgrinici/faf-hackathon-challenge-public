#!/bin/sh
set -e

# Always start from a clean database. migrate reset doesn't reliably
# auto-run the seed step here, so we seed explicitly right after.
pnpm exec prisma migrate reset --force
node dist/prisma/seed.js
exec node dist/src/main.js