# Financeiro do Casal 💑💰

App PWA (instalável no celular) para a vida financeira e a rotina do casal: conta conjunta, lançamentos, metas, cartões/dívidas, **afazeres de casa** e **alertas** de vencimentos e tarefas.

100% estático (HTML + JS + Chart.js). Os dados ficam salvos no próprio aparelho (localStorage) — nada vai para a internet.

## Rodar local
Abra o `index.html` no navegador. Para testar como PWA (instalável), sirva por HTTP, ex.:
```bash
python3 -m http.server 8080   # depois acesse http://localhost:8080
```

## Deploy
- **EasyPanel:** veja [`DEPLOY-EASYPANEL.md`](DEPLOY-EASYPANEL.md) (build por Dockerfile, HTTPS automático).
- **VPS / nginx ou Docker:** veja [`DEPLOY.md`](DEPLOY.md).

> O PWA precisa de **HTTPS** para instalar no celular (Android/iPhone).

## Estrutura
```
index.html              # o app
default.conf            # nginx dentro do container
Dockerfile              # imagem estática (nginx:alpine)
manifest.webmanifest    # PWA
sw.js                   # service worker (offline)
icon-*.png              # ícones do app
```

## Funcionalidades
- Conta conjunta com acerto de contas automático
- Lançamentos com despesas rápidas pré-cadastradas
- Metas e poupança com progresso
- Cartões, dívidas e compromisso mensal
- Afazeres de casa (responsável, recorrência, revezar)
- Alertas de vencimentos e tarefas, com notificação no aparelho
- **Conta na nuvem (opcional):** login, convite do par por código e **sincronização entre os dois celulares**
- **Notificações push** com resumo diário (funciona com o app fechado)
- **Conceito do dia** (frases e dicas) e **Conselheiro IA** via OpenRouter (opcional)
- **Pets & cuidados:** perfil do bicho (com foto) e cuidados prontos viram tarefas com lembrete
- **Viagens & sonhos:** orçamento, poupança, contagem regressiva, checklist e galeria de memórias
- **Fotos:** foto de capa/memórias nas viagens e **comprovante** nas despesas (base64, abre a câmera no celular)

## Sincronização na nuvem (opcional)
Por padrão o app funciona 100% offline (localStorage). Se quiser que o casal compartilhe os
dados entre aparelhos, suba o backend em [`server/`](server/README.md) (Node + Postgres) e
configure o endereço da API em **Mais → Conta & sincronização**. Sem backend, nada muda — o app
continua local.

---
Feito com ❤
