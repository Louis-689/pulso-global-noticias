#!/bin/sh
# Pulso Global en Linux: ./iniciar.sh
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Necesitas Node.js 20 o superior: https://nodejs.org (o tu gestor de paquetes)"
  exit 1
fi
exec node scripts/iniciar.mjs
