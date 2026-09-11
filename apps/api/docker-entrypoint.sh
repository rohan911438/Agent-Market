#!/bin/sh
# Applies any pending migrations before the API starts serving traffic —
# safe to run on every boot: `prisma migrate deploy` is a no-op when the
# database is already up to date.
set -e
node_modules/.bin/prisma migrate deploy --schema packages/database/prisma/schema.prisma
exec node apps/api/dist/main.js
