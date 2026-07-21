#!/usr/bin/env bash
# Voider 3D Studio — Mac/Linux launcher
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js install nahi hai! https://nodejs.org se LTS version install karo."
  exit 1
fi

[ -d node_modules ] || { echo "Pehli baar setup ho raha hai..."; npm install; }

echo "Voider 3D Studio start ho raha hai — browser me kholo: http://localhost:3000"
(sleep 2 && (open http://localhost:3000 2>/dev/null || xdg-open http://localhost:3000 2>/dev/null)) &
node server.js
