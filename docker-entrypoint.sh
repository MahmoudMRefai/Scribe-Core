#!/bin/sh
set -e

echo "⏳ Waiting for PostgreSQL to be ready..."
until pg_isready -h "${DB_HOST:-scribe-db}" -p "${DB_PORT:-5432}" -U "${POSTGRES_USER:-scribe}" -d "${POSTGRES_DB:-scribe_dev}" >/dev/null 2>&1; do
  sleep 1
done
echo "✅ PostgreSQL is ready."

# Clean database URL without Prisma query params (e.g. ?schema=public) for psql CLI
CLEAN_PG_URL=$(echo "$DATABASE_URL" | cut -d'?' -f1)

# Check if a valid SQL backup exists at /backup/scribe_backup.sql and DB is still empty
TABLE_COUNT=$(psql "${CLEAN_PG_URL}" -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';" 2>/dev/null || echo "0")

if [ "$TABLE_COUNT" = "0" ] && [ -s /backup/scribe_backup.sql ]; then
  if ! grep -q "^pg_dumpall: error:" /backup/scribe_backup.sql && grep -qE "(CREATE TABLE|INSERT INTO|COPY )" /backup/scribe_backup.sql; then
    echo "📦 Restoring database from /backup/scribe_backup.sql..."
    psql "${CLEAN_PG_URL}" -f /backup/scribe_backup.sql
    echo "✅ Backup restored successfully."
  else
    echo "ℹ️  /backup/scribe_backup.sql is not a valid SQL dump (contains pg_dumpall error or no schema). Initializing via Prisma instead..."
  fi
fi

echo "🔄 Syncing Prisma schema..."
npx prisma db push --skip-generate --accept-data-loss

echo "🔒 Ensuring immutable wallet transaction trigger..."
npx prisma db execute --file prisma/sql/wallet_transaction_immutable.sql --schema prisma/schema.prisma

echo "🌱 Running idempotent database seed..."
NODE_ENV=development npx tsx prisma/seed.ts

echo "🚀 Starting Scribe Core server..."
exec node dist/server.js

