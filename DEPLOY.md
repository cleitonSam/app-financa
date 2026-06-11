# Deploy do "Financeiro do Casal" na sua VPS

App PWA estático (HTML + ícones). Para instalar como **app de verdade** no Android e no iPhone, ele precisa ser servido por **HTTPS** (o service worker e a instalação não funcionam em `http://` puro, só em `https://` ou `localhost`).

Arquivos que sobem para o servidor:

```
index.html
manifest.webmanifest
sw.js
icon-192.png  icon-512.png  icon-maskable-192.png  icon-maskable-512.png
apple-touch-icon.png  favicon-32.png
```

Pré-requisito comum: um subdomínio apontando (registro **A**) para o IP da VPS, ex.: `financeiro.seudominio.com.br`.

---

## Opção A — Nginx direto na VPS (recomendado)

```bash
# 1. Criar a pasta e enviar os arquivos (rode no seu PC, ajuste usuário/host)
ssh root@SEU_IP "mkdir -p /var/www/financeiro"
scp index.html manifest.webmanifest sw.js *.png root@SEU_IP:/var/www/financeiro/

# 2. Na VPS: instalar nginx e certbot
sudo apt update && sudo apt install -y nginx certbot python3-certbot-nginx

# 3. Copiar o server block (edite o server_name antes)
sudo cp nginx.conf /etc/nginx/sites-available/financeiro
sudo ln -s /etc/nginx/sites-available/financeiro /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# 4. Gerar o HTTPS automático (Let's Encrypt)
sudo certbot --nginx -d financeiro.seudominio.com.br
```

Pronto: acesse `https://financeiro.seudominio.com.br` no celular.

---

## Opção B — Docker

```bash
# Na pasta do projeto, dentro da VPS:
docker compose up -d --build
# App em http://IP-DA-VPS:8080
```

Coloque um proxy com HTTPS na frente (Nginx Proxy Manager, Traefik ou Caddy).
Exemplo rápido com **Caddy** (HTTPS automático), criando um `Caddyfile`:

```
financeiro.seudominio.com.br {
    reverse_proxy localhost:8080
}
```

---

## Instalar no celular (depois do site no ar com HTTPS)

**Android (Chrome):** abra o link → menu ⋮ → **"Instalar app"** / "Adicionar à tela inicial". Abre em tela cheia, com ícone.

**iPhone (Safari):** abra o link → botão **Compartilhar** (quadrado com seta) → **"Adicionar à Tela de Início"**.

Dica: o app já mostra um banner "Instalar" no Android quando tudo está certo. Os dois (Android e iPhone) compartilham o mesmo link, mas **os dados ficam salvos em cada aparelho** (não sincronizam entre si). Para sincronizar entre os dois celulares do casal seria preciso um backend — me avise se quiser que eu planeje isso.

---

## Atualizar o app depois
Basta reenviar o `index.html` (e rodar `docker compose up -d --build` na opção B). O service worker já está configurado para buscar a versão nova. Se quiser forçar, troque a versão do cache em `sw.js` (`financeiro-casal-v1` → `v2`).
