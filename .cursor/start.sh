#!/usr/bin/env bash
# Per-boot startup: bring up the local MongoDB and wait until it accepts
# connections so the API server (started in a terminal) can connect.
set -euo pipefail

if ! pgrep -x mongod >/dev/null 2>&1; then
  mongod --dbpath /var/lib/mongodb --bind_ip 127.0.0.1 --port 27017 \
    --fork --logpath /var/log/mongodb/mongod.log
fi

for _ in $(seq 1 30); do
  if mongosh --quiet --eval "db.runCommand({ ping: 1 })" >/dev/null 2>&1; then
    echo "MongoDB is ready on 127.0.0.1:27017"
    exit 0
  fi
  sleep 1
done

echo "MongoDB did not become ready in time" >&2
exit 1
