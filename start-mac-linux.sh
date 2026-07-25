#!/usr/bin/env bash
# Voider 3D Studio — Mac/Linux launcher (koi npm install nahi chahiye)
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js install nahi hai! https://nodejs.org se LTS version install karo."
  exit 1
fi

echo "Voider 3D Studio start ho raha hai — browser khud khul jayega."
node server.js
