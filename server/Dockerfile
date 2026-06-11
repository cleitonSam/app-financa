# Financeiro do Casal — API (Node) para login por convite e sincronização
FROM node:20-alpine

WORKDIR /app

# Instala só dependências de produção primeiro (melhor cache)
COPY package.json ./
RUN npm install --omit=dev

COPY . .

ENV NODE_ENV=production
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget -qO- http://localhost:8787/api/health >/dev/null 2>&1 || exit 1

CMD ["node", "index.js"]
