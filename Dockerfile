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

# 3