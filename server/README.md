# Financeiro do Casal — API (backend)

Backend pequeno (Node + Express + Postgres) que dá ao app:

- **Cadastro e login** (e-mail + senha, com hash bcrypt e sessão por token JWT)
- **Convite do casal** — uma pessoa gera um código e a outra entra com ele
- **Sincronização na nuvem** — os dois aparelhos compartilham os mesmos dados

Tudo fica isolado no schema **`financeiro_casal`** do banco (não toca em nenhuma tabela existente). O schema e as tabelas são criados **automaticamente** quando o servidor sobe.

## Variáveis de ambiente

Veja `.env.example`. As principais:

| Variável | Para quê |
|---|---|
| `DATABASE_URL` | string de conexão do Postgres |
| `JWT_SECRET` | segredo para assinar as sessões — **defina um fixo** (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) |
| `DB_SCHEMA` | schema isolado (padrão `financeiro_casal`) |
| `PORT` | porta (padrão `8787`) |
| `ALLOWED_ORIGIN` | (opcional) restringe o CORS ao domínio do app |

## Rodar local

```bash
cd server
cp .env.example .env   # edite com seus valores
npm install
npm start
```

A API sobe em `http://localhost:8787`. Teste: `curl http://localhost:8787/api/health`.

## Deploy no EasyPanel (recomendado)

1. Crie um **novo app** no EasyPanel apontando para esta pasta `server/` (build por Dockerfile).
2. Em **Environment**, defina `DATABASE_URL`, `JWT_SECRET` e (opcional) `ALLOWED_ORIGIN`.
3. Exponha a porta **8787**. Dê um domínio, ex.: `https://api-casal.seudominio.com`.
4. No app (frontend), abra **Mais → Conta & sincronização → Servidor (avançado)** e informe:
   `https://api-casal.seudominio.com/api`
   (defina `ALLOWED_ORIGIN` no backend com o domínio do app para travar o CORS).

### Alternativa: mesma origem (`/api`) via proxy do nginx

Se preferir que o app chame `/api` no mesmo domínio (sem configurar o campo avançado), adicione um proxy no `default.conf` do **container estático** apontando para o serviço da API na rede interna do EasyPanel:

```nginx
location /api/ {
    proxy_pass http://NOME-DO-SERVICO-API:8787;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

Assim o padrão `/api` do app já funciona e o Service Worker ignora essas chamadas (não cacheia a API).

## Endpoints

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| GET | `/api/health` | — | status |
| POST | `/api/register` | — | `{nome,email,senha}` → cria conta + casal |
| POST | `/api/login` | — | `{email,senha}` |
| GET | `/api/me` | Bearer | dados do usuário + casal |
| POST | `/api/invite` | Bearer | gera código de convite (casal com 1 pessoa) |
| POST | `/api/join` | Bearer | `{codigo}` → entra no casal de quem convidou |
| GET | `/api/state` | Bearer | dados sincronizados do casal |
| PUT | `/api/state` | Bearer | `{dados}` → salva os dados do casal |
| GET | `/api/push/key` | — | chave pública VAPID para assinar o push |
| POST | `/api/push/subscribe` | Bearer | `{subscription}` → registra o aparelho |
| POST | `/api/push/unsubscribe` | Bearer | `{endpoint}` → remove o aparelho |
| POST | `/api/push/test` | Bearer | envia uma notificação de teste |

## Notificações push (lembretes com o app fechado)

O servidor envia um **resumo diário** (de manhã, fuso `APP_TZ`, hora `DIGEST_HOUR`) para os dois
celulares do casal, lendo o estado sincronizado: tarefas de hoje, contas que vencem hoje,
atrasados e o que vem amanhã. Há **dedupe** (um resumo por dia por casal, sobrevive a reinícios).

- As chaves **VAPID** são geradas e guardadas automaticamente no banco se você não definir as
  variáveis `VAPID_*` (veja `.env.example`).
- **iOS:** o Web Push só funciona com o app **instalado** na tela inicial (iOS 16.4+). Android e
  desktop (Chrome/Edge/Firefox) funcionam no navegador também.
- O usuário ativa em **Mais → Alertas → Notificações no aparelho** (precisa estar logado para
  receber com o app fechado; sem conta, só com o app aberto).

## ⚠️ Segurança — faça antes de ir para produção

- **Troque a senha do Postgres** (a usada nos testes foi compartilhada em texto puro).
- **Habilite SSL** no banco (`sslmode=require`) — hoje está `disable` (tráfego sem criptografia).
- Defina `JWT_SECRET` fixo e `ALLOWED_ORIGIN` com o domínio do app.
- Nunca coloque a `DATABASE_URL` no frontend — ela vive **só** aqui no backend.
