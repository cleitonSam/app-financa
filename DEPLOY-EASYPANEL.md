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

**2. Coloque os arquivos 