# Subir o "Financeiro do Casal" no EasyPanel

O EasyPanel já cuida do **HTTPS automático** (Let's Encrypt via Traefik). O container só serve os arquivos na porta **80** — perfeito para PWA, que exige HTTPS para instalar no celular.

## Arquivos que o build usa
```
Dockerfile
default.conf
index.html
manifest.webmanifest
sw.js
icon-192.png  icon-512.png  icon-maskable-192.png  icon-maskable-512.png
apple-touch-icon.png  favicon-32.png
.dockerignore
```

---

## Passo a passo (build por Dockerfile, via Git)

**1. Aponte o DNS:** crie um registro **A** do subdomínio (ex.: `financeiro.seudominio.com.br`) para o **IP da sua VPS**.

**2. Coloque os arquivos num repositório Git** (GitHub/GitLab). Pode ser um repo privado — é só conectar a conta no EasyPanel.

**3. No EasyPanel:**
- Abra/crie um **Project** → **+ Service** → **App**.
- Aba **Source**: escolha **GitHub** (ou Git genérico), selecione o **repositório** e a **branch**.
- Aba **Build**: em *Build Method* escolha **Dockerfile**. Deixe o *Dockerfile Path* como `Dockerfile`.
- Clique em **Deploy** e acompanhe o log até "running".

**4. Domínio + HTTPS:**
- Aba **Domains** → **Add Domain**.
- Host: `financeiro.seudominio.com.br` · **Port: 80** · deixe **HTTPS/SSL** ligado.
- Salve. Em ~1 min o certificado é emitido.

**5. Instalar no celular:** abra `https://financeiro.seudominio.com.br`
- **Android (Chrome):** menu ⋮ → *Instalar app*.
- **iPhone (Safari):** Compartilhar → *Adicionar à Tela de Início*.

---

## Alternativa sem Git (imagem pronta)

No seu PC ou na VPS, com a pasta do projeto:
```bash
docker build -t SEU_USUARIO/financeiro-casal:latest .
docker push SEU_USUARIO/financeiro-casal:latest
```
No EasyPanel: **App** → aba **Source** → **Docker Image** → informe `SEU_USUARIO/financeiro-casal:latest`. Depois configure o **Domain** na porta **80** como acima.

---

## Atualizar depois
Reenvie o `index.html` (commit no Git) e clique **Deploy** de novo no EasyPanel. Para forçar a atualização no aparelho, troque a versão do cache no `sw.js` (`financeiro-casal-v1` → `v2`).

> Observação: os dados ficam salvos em cada aparelho (não sincronizam entre os dois celulares). Para sincronizar entre o casal seria preciso um backend — posso planejar isso se quiser.
