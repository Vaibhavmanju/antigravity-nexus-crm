#!/bin/sh
set -e

DB_HOST="${DB_HOST:-mysql}"
DB_PORT="${DB_PORT:-3306}"

echo "⏳  Waiting for MySQL at ${DB_HOST}:${DB_PORT}..."
ATTEMPTS=0
until node -e "require('net').createConnection({host:process.env.DB_HOST||'mysql',port:process.env.DB_PORT||3306}).on('connect', c => process.exit(0)).on('error', () => process.exit(1))" 2>/dev/null; do
  ATTEMPTS=$((ATTEMPTS + 1))
  if [ "$ATTEMPTS" -ge 60 ]; then
    echo "❌  MySQL did not become reachable after 60 attempts — starting anyway (app will retry connections)."
    break
  fi
  sleep 2
done
echo "✅  MySQL reachable (or timed out waiting) — continuing."

# Schema setup is idempotent (CREATE TABLE IF NOT EXISTS / ensureColumn), so
# it's safe to run on every container start — cheap no-op after the first run.
echo "🛠   Running database setup..."
node src/config/setupDatabase.js || echo "⚠️   setup-db reported an issue — check DB credentials if this persists."

echo "🚀  Starting server..."
exec "$@"
