#!/bin/sh
# Sobe o backend Node e o nginx no mesmo container.
# Se qualquer um dos dois cair, o container encerra e o EasyPanel reinicia.
set -e

echo "[entrypoint] iniciando backend Node..."
node /app/index.js &
NODE_PID=$!

echo "[entrypoint] iniciando nginx..."
nginx -g 'daemon off;' &
NGINX_PID=$!

# Encerra ambos quando receber sinal de parada
term() {
  echo "[entrypoint] encerrando..."
  kill "$NODE_PID" "$NGINX_PID" 2>/dev/null || true
}
trap term TERM INT

# Espera o primeiro processo terminar; se um morrer, derruba o outro e sai com erro
while kill -0 "$NODE_PID" 2>/dev/null && kill -0 "$NGINX_PID" 2>/dev/null; do
  sleep 2
done

echo "[entrypoint] um dos processos terminou — encerrando o container."
term
exit 1
