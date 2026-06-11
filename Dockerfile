# Financeiro do Casal — imagem ÚNICA: PWA (nginx) + API (Node) no mesmo container.
# O nginx serve os arquivos na porta 80 e faz proxy de /api -> Node (127.0.0.1:8787).
# Assim o app conecta no backend pela mesma origem (sem CORS) usando as variáveis
# de ambiente do EasyPanel (DATABASE_URL, JWT_SECRET, OPENROUTER_API_KEY, etc.).
FROM node:20-alpine

# nginx + utilitários
RUN apk add --no-cache nginx wget && mkdir -p /run/nginx

WORKDIR /app

# 1) Dependências do backend primeiro (melhor cache de build)
COPY server/package.json ./
RUN npm install --omit=dev

# 2) Código do backend
COPY server/ ./

# 3) Frontend estático (PWA)
COPY index.html manifest.webmanifest sw.js *.png /usr/share/nginx/html/

# 4) Config do nginx (inclui o proxy /api) + MIME do manifest
RUN sed -i 's#^\s*types {#types {\n    application/manifest+json webmanifest;#' /etc/nginx/mime.types || true
COPY default.conf /etc/nginx/http.d/default.conf

# 5) Inicia Node + nginx juntos
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

ENV NODE_ENV=production
ENV PORT=8787
EXPOSE 80

# Saudável só quando a API responde através do nginx
HEALTHCHECK --interval=30s --timeout=4s --start-period=20s \
  CMD wget -qO- http://localhost/api/health >/dev/null 2>&1 || exit 1

CMD ["/docker-entrypoint.sh"]
