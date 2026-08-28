#!/usr/bin/env bash
# Idempotent bootstrap for the Debate Timer dev environment.
# Installs Bun (frontend package manager/runner), a local MongoDB, project
# dependencies, and dev-only .env files. Safe to run multiple times.
set -euo pipefail

cd "$(dirname "$0")/.."

# 1. Bun (frontend package manager + script runner)
if ! command -v bun >/dev/null 2>&1 && [ ! -x "$HOME/.bun/bin/bun" ]; then
  curl -fsSL https://bun.sh/install | bash
fi
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"

# 2. Local MongoDB 8.0 (config-template API storage)
if ! command -v mongod >/dev/null 2>&1; then
  sudo apt-get install -y gnupg curl
  curl -fsSL https://www.mongodb.org/static/pgp/server-8.0.asc \
    | sudo gpg -o /usr/share/keyrings/mongodb-server-8.0.gpg --dearmor
  echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-8.0.gpg ] https://repo.mongodb.org/apt/ubuntu noble/mongodb-org/8.0 multiverse" \
    | sudo tee /etc/apt/sources.list.d/mongodb-org-8.0.list
  sudo apt-get update
  sudo apt-get install -y mongodb-org
fi
sudo mkdir -p /var/lib/mongodb /var/log/mongodb
sudo chown -R "$(whoami)" /var/lib/mongodb /var/log/mongodb

# 3. Project dependencies
bun install
(cd server && bun install)

# 4. Dev-only env files (never overwrite existing local values)
if [ ! -f server/.env ]; then
  cat > server/.env <<'EOF'
PORT=3001
MONGODB_URI=mongodb://127.0.0.1:27017/debatetimer
ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
API_KEY=dev-local-key
EOF
fi

if [ ! -f .env.development.local ]; then
  cat > .env.development.local <<'EOF'
VITE_API_BASE_URL=
VITE_DEV_API_PROXY=http://127.0.0.1:3001
VITE_API_KEY=dev-local-key
EOF
fi

echo "Debate Timer environment install complete."
