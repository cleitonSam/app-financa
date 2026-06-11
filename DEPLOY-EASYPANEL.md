# Subir o "Financeiro do Casal" no EasyPanel

O EasyPanel já cuida do **HTTPS automático** (Let's Encrypt via Traefik). O container serve o app na porta **80** — perfeito para PWA, que exige HTTPS para instalar no celular.

> **Importante (atualização):** agora é **uma imagem só** que roda o site (nginx) **e** o backend (Node) juntos. O nginx faz proxy de `/api` para o Node internamente, então o app conecta no servidor pela mesma origem — **sem CORS e sem configurar "Servidor (avançado)" no app** (deixe em `/api`). É isto que faz o login, a sincronização do casal e a IA funcionarem.

## Variáveis de ambiente (aba **Environment** do serviço)

| Variável | Obrigatória? | Para quê |
|---|---|---|
| `DATABASE_URL` | **Sim** | Conexão Postgres. Ex.: `postgres://usuario:senha@host:5432/banco?sslmode=disable` |
| `JWT_SECRET` | Recomendada | Segredo das sessões. Sem ela, todo deploy desloga todo mundo. Gere com `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `DB_SCHEMA` | Não (padrão `financeiro_casal`) | Schema isolado — não toca em nenhuma tabela existente do seu banco |
| `OPENROUTER_API_KEY` | Não | Liga o conselheiro de IA. Sem ela o app funciona normal, só a IA fica desligada |
| `VAPID_SUBJECT` | Não | `mailto:voce@seudominio.com` para notificações push |

> O app cria as tabelas sozinho no primeiro start (dentro do schema `financeiro_casal`). Não precisa rodar SQL na mão.

## Criar um usuário sem abrir o app (opcional)

No EasyPanel, aba **Console/Terminal** do serviço (ou via SSH no container), rode:
```bash
node criar-usuario.js "Seu Nome" "voce@email.com" "suaSenha123"
```
Se o e-mail já existir, ele só atualiza a senha. Depois é só entrar no app com esse e-mail e senha.

## Arquivos que o build usa
```
Dockerfile
default.conf
docker-entrypoint.sh
server/            (backend Node — login, sincronização, push, IA)
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

> Observação: com o backend ativo (esta versão), os dados são **salvos no banco e sincronizam entre os dois celulares** do casal. Cada um cria sua conta; um gera um **código de convite** (tela "Nuvem") e o outro usa o código para parear.

---

## ⚠️ Resolução de problemas: "não faz login" / "IA não conecta"

**Sintoma:** o app abre normal, mas login, cadastro, sincronização e IA não funcionam. No log do EasyPanel aparece algo como:

```
GET /api/ai/status  200  128099
GET /index.html     200  128099
```

Repare que `/api/...` devolve **exatamente o mesmo tamanho** do `index.html`. Isso quer dizer que o servidor está entregando a **página do app** no lugar da resposta da API — ou seja, **o backend Node não está no ar / o nginx não está fazendo o proxy de `/api`**. O app agora detecta isso e mostra a mensagem *"O servidor não está respondendo à API"* em vez de falhar em silêncio.

**Causa quase sempre:** o serviço no EasyPanel foi publicado como **site estático** (Nixpacks/Static) em vez de pela **imagem Docker**. Aí só os arquivos sobem, sem o Node.

**Como corrigir:**

1. No serviço, aba **Build** → *Build Method* = **Dockerfile** (não "Nixpacks", não "Static"). *Dockerfile Path* = `Dockerfile`.
2. Aba **Environment**: confirme que `DATABASE_URL` e `JWT_SECRET` estão preenchidas. Sem `DATABASE_URL` o Node sobe e cai em loop → o container reinicia sem parar.
3. Clique em **Deploy** e acompanhe o log. Tem que aparecer as duas linhas:
   `[entrypoint] iniciando backend Node...` e `[api] ouvindo na porta 8787`.
4. Teste no navegador: abra `https://SEU_DOMINIO/api/health`. O certo é vir um JSON pequeno `{"ok":true}` — **não** a página do app.
5. Para a **IA**: além do passo acima, preencha `OPENROUTER_API_KEY` na aba Environment e faça Deploy de novo. Confira em `https://SEU_DOMINIO/api/ai/status` → deve vir `{"enabled":true,...}`.

> Dica rápida de diagnóstico: se `/api/health` mostrar a página do app (HTML) em vez do JSON, o problema é **100% de deploy** (Build Method), não do código.
