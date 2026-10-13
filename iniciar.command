#!/bin/sh
# Pulso Global: doble clic en Mac.
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Necesitas Node.js 20 o superior: https://nodejs.org"
  open https://nodejs.org 2>/dev/null
  exit 1
fi
exec node scripts/iniciar.mjs
