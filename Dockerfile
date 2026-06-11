# Financeiro do Casal — imagem estática (PWA) para EasyPanel / Docker
FROM nginx:alpine

# Adiciona o MIME do manifest do PWA sem sobrescrever os demais tipos
RUN sed -i 's#^types {#types {\n    application/manifest+json webmanifest;#' /etc/nginx/mime.types

# Config do site dentro do container
COPY default.conf /etc/nginx/conf.d/default.conf

# Arquivos do app
COPY index.html manifest.webmanifest sw.js *.png /usr/share/nginx/html/

EXPOSE 80

# Healthcheck simples (opcional, o EasyPanel mostra o status)
HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget -qO- http://localhost/ >/dev/null 2>&1 || exit 1
