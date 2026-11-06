#!/bin/sh
set -e

# Default ports and settings
export PORT="${PORT:-3000}"
export BACKEND_PORT="${BACKEND_PORT:-4000}"
export API_UPSTREAM="${API_UPSTREAM:-http://127.0.0.1:$BACKEND_PORT}"
export APP_URL="${APP_URL:-http://localhost:$PORT}"
export DB_PORT="${DB_PORT:-1433}"
export DB_AUTH="${DB_AUTH:-sql}"
export DB_ENCRYPT="${DB_ENCRYPT:-true}"
export DB_TRUST_SERVER_CERTIFICATE="${DB_TRUST_SERVER_CERTIFICATE:-true}"

# Ensure backend/.env exists so Node's --env-file=.env does not crash
if [ ! -f /app/backend/.env ]; then
  touch /app/backend/.env
fi

# Ensure DATA_KEY_HEX is 64 hex characters (required by backend for encryption)
if [ -z "$DATA_KEY_HEX" ] || [ $(echo -n "$DATA_KEY_HEX" | wc -c) -ne 64 ]; then
  echo "Generating 64-char hex DATA_KEY_HEX..."
  export DATA_KEY_HEX=$(node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))")
fi

# Sync DATA_KEY_HEX and PORT into backend/.env
grep -q '^DATA_KEY_HEX=' /app/backend/.env 2>/dev/null || echo "DATA_KEY_HEX=$DATA_KEY_HEX" >> /app/backend/.env
grep -q '^PORT=' /app/backend/.env 2>/dev/null || echo "PORT=$BACKEND_PORT" >> /app/backend/.env

# Wait for database if DB_SERVER is configured and not local
if [ -n "$DB_SERVER" ] && [ "$DB_SERVER" != "localhost" ] && [ "$DB_SERVER" != "127.0.0.1" ]; then
  echo "Waiting for database connection at $DB_SERVER:$DB_PORT..."
  node -e "
    const net = require('node:net');
    const host = process.env.DB_SERVER;
    const port = Number(process.env.DB_PORT || 1433);
    const start = Date.now();
    function check() {
      const sock = net.createConnection({ host, port, timeout: 2000 }, () => {
        console.log('Database server port is open and reachable.');
        sock.destroy();
        process.exit(0);
      });
      sock.on('error', () => {
        sock.destroy();
        if (Date.now() - start > 90000) {
          console.error('Timed out waiting for database server after 90 seconds.');
          process.exit(1);
        }
        setTimeout(check, 2000);
      });
      sock.on('timeout', () => {
        sock.destroy();
        if (Date.now() - start > 90000) {
          console.error('Timed out waiting for database server after 90 seconds.');
          process.exit(1);
        }
        setTimeout(check, 2000);
      });
    }
    check();
  "
fi

# Run migrations if enabled (default: true)
if [ "${AUTO_MIGRATE:-true}" = "true" ] && [ -n "$DB_SERVER" ]; then
  echo "Running database migrations..."
  npm run db:migrate -w backend || echo "Migration command finished (verify database status if needed)."
fi

# Seed demo data if requested (default: false)
if [ "${AUTO_SEED:-false}" = "true" ] && [ -n "$DB_SERVER" ]; then
  echo "Seeding demo accounts (if database is empty)..."
  NODE_ENV=development npm run db:seed -w backend -- --if-empty || echo "Seed command completed."
fi

# If command is 'npm start' or empty, run all services with concurrently
if [ "$1" = "npm" ] && [ "$2" = "start" ] || [ -z "$1" ]; then
  echo "Starting Vela Web services (API: :$BACKEND_PORT, Frontend: :$PORT)..."
  exec npx concurrently --kill-others \
    -n api,web,jobs \
    -c "cyan,green,yellow" \
    "env PORT=$BACKEND_PORT npm start -w backend" \
    "env PORT=$PORT HOSTNAME=0.0.0.0 npm start -w frontend" \
    "npm run jobs -w backend"
fi

exec "$@"
