const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { pool, migrate, SCHEMA } = require('./db');
const push = require('./push');
const ai = require('./ai');

const PORT = process.env.PORT || 8787;
let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  JWT_SECRET = crypto.randomBytes(32).toString('hex');
  console.warn('[auth] JWT_SECRET não definido — gerei um temporário. Defina JWT_SECRET no ambiente para manter as sessões entre reinícios.');
}

const app = express();
app.use(express.json({ limit: '12mb' })); // base64 de fotos (pets, viagens, comprovantes) pesa mais
// CORS: por padrão liberado; em produção restrinja com ALLOWED_ORIGIN (ex.: https://casal.seudominio.com)
const ORIGIN = process.env.ALLOWED_ORIGIN;
app.use(cors(ORIGIN ? { origin: ORIGIN.split(',').map(s => s.trim()) } : {}));

/* ---------- helpers ---------- */
const q = (text, params) => pool.query(text, params);
const ok = (s) => typeof s === 'string' && s.trim().length > 0;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem 0/O/1/I
function genCode(len = 6) {
  const b = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[b[i] % ALPHABET.length];
  return out;
}
function sign(userId) {
  return jwt.sign({ uid: userId }, JWT_SECRET, { expiresIn: '180d' });
}
function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const tok = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!tok) return res.status(401).json({ erro: 'Não autenticado' });
  try {
    req.uid = jwt.verify(tok, JWT_SECRET).uid;
    next();
  } catch (e) {
    res.status(401).json({ erro: 'Sessão inválida ou expirada' });
  }
}
async function getMe(userId) {
  const u = await q(`SELECT id, nome, email, casal_id FROM ${SCHEMA}.usuarios WHERE id=$1`, [userId]);
  if (!u.rowCount) return null;
  const user = u.rows[0];
  const membros = await q(
    `SELECT id, nome, email FROM ${SCHEMA}.usuarios WHERE casal_id=$1 ORDER BY criado_em`,
    [user.casal_id]
  );
  return {
    user: { id: user.id, nome: user.nome, email: user.email },
    casal: { id: user.casal_id, membros: membros.rows, pareado: membros.rowCount >= 2 },
  };
}

/* ---------- rotas ---------- */
app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.post('/api/register', async (req, res) => {
  try {
    const nome = (req.body.nome || '').trim();
    const email = (req.body.email || '').trim().toLowerCase();
    const senha = req.body.senha || '';
    if (!ok(nome) || !ok(email) || senha.length < 6)
      return res.status(400).json({ erro: 'Informe nome, e-mail e senha (mínimo 6 caracteres).' });
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
      return res.status(400).json({ erro: 'E-mail inválido.' });

    const exists = await q(`SELECT 1 FROM ${SCHEMA}.usuarios WHERE lower(email)=lower($1)`, [email]);
    if (exists.rowCount) return res.status(409).json({ erro: 'Já existe uma conta com esse e-mail.' });

    const hash = await bcrypt.hash(senha, 10);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const casal = await client.query(`INSERT INTO ${SCHEMA}.casais DEFAULT VALUES RETURNING id`);
      const casalId = casal.rows[0].id;
      const ins = await client.query(
        `INSERT INTO ${SCHEMA}.usuarios (nome, email, senha_hash, casal_id) VALUES ($1,$2,$3,$4) RETURNING id`,
        [nome, email, hash, casalId]
      );
      await client.query(`INSERT INTO ${SCHEMA}.estado (casal_id, dados) VALUES ($1,'{}'::jsonb)`, [casalId]);
      await client.query('COMMIT');
      const me = await getMe(ins.rows[0].id);
      res.json({ token: sign(ins.rows[0].id), ...me });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    console.error('register', e);
    res.status(500).json({ erro: 'Erro ao criar conta.' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    const senha = req.body.senha || '';
    const r = await q(`SELECT id, senha_hash FROM ${SCHEMA}.usuarios WHERE lower(email)=lower($1)`, [email]);
    if (!r.rowCount) return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });
    const okPass = await bcrypt.compare(senha, r.rows[0].senha_hash);
    if (!okPass) return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });
    const me = await getMe(r.rows[0].id);
    res.json({ token: sign(r.rows[0].id), ...me });
  } catch (e) {
    console.error('login', e);
    res.status(500).json({ erro: 'Erro ao entrar.' });
  }
});

app.get('/api/me', auth, async (req, res) => {
  const me = await getMe(req.uid);
  if (!me) return res.status(404).json({ erro: 'Usuário não encontrado' });
  res.json(me);
});

// Gera um código para convidar o(a) parceiro(a). Só funciona se o casal ainda não está pareado.
app.post('/api/invite', auth, async (req, res) => {
  try {
    const me = await getMe(req.uid);
    if (!me) return res.status(404).json({ erro: 'Usuário não encontrado' });
    if (me.casal.pareado) return res.status(400).json({ erro: 'Seu casal já está completo (2 pessoas).' });
    // reaproveita um convite válido se já existir
    const existing = await q(
      `SELECT codigo, expira_em FROM ${SCHEMA}.convites WHERE casal_id=$1 AND usado=false AND expira_em>now() ORDER BY criado_em DESC LIMIT 1`,
      [me.casal.id]
    );
    if (existing.rowCount) return res.json({ codigo: existing.rows[0].codigo, expira_em: existing.rows[0].expira_em });

    let codigo;
    for (let tries = 0; tries < 5; tries++) {
      codigo = genCode(6);
      const dup = await q(`SELECT 1 FROM ${SCHEMA}.convites WHERE codigo=$1`, [codigo]);
      if (!dup.rowCount) break;
    }
    const expira = new Date(Date.now() + 7 * 864e5); // 7 dias
    await q(
      `INSERT INTO ${SCHEMA}.convites (codigo, casal_id, criado_por, expira_em) VALUES ($1,$2,$3,$4)`,
      [codigo, me.casal.id, req.uid, expira.toISOString()]
    );
    res.json({ codigo, expira_em: expira.toISOString() });
  } catch (e) {
    console.error('invite', e);
    res.status(500).json({ erro: 'Erro ao gerar convite.' });
  }
});

// Entra no casal de quem convidou, usando o código.
app.post('/api/join', auth, async (req, res) => {
  const codigo = (req.body.codigo || '').trim().toUpperCase();
  if (!ok(codigo)) return res.status(400).json({ erro: 'Informe o código de convite.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const conv = await client.query(
      `SELECT codigo, casal_id, usado, expira_em FROM ${SCHEMA}.convites WHERE codigo=$1 FOR UPDATE`,
      [codigo]
    );
    if (!conv.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ erro: 'Código não encontrado.' }); }
    const c = conv.rows[0];
    if (c.usado) { await client.query('ROLLBACK'); return res.status(400).json({ erro: 'Esse convite já foi usado.' }); }
    if (new Date(c.expira_em) < new Date()) { await client.query('ROLLBACK'); return res.status(400).json({ erro: 'Convite expirado.' }); }

    const meRow = await client.query(`SELECT casal_id FROM ${SCHEMA}.usuarios WHERE id=$1 FOR UPDATE`, [req.uid]);
    const oldCasal = meRow.rows[0].casal_id;
    if (oldCasal === c.casal_id) { await client.query('ROLLBACK'); return res.status(400).json({ erro: 'Você já faz parte desse casal.' }); }

    const count = await client.query(`SELECT count(*)::int n FROM ${SCHEMA}.usuarios WHERE casal_id=$1`, [c.casal_id]);
    if (count.rows[0].n >= 2) { await client.query('ROLLBACK'); return res.status(400).json({ erro: 'Esse casal já está completo.' }); }

    // move o usuário para o casal do convite
    await client.query(`UPDATE ${SCHEMA}.usuarios SET casal_id=$1 WHERE id=$2`, [c.casal_id, req.uid]);
    await client.query(`UPDATE ${SCHEMA}.convites SET usado=true WHERE codigo=$1`, [codigo]);
    // se o casal antigo ficou vazio, remove (cascata limpa estado/convites órfãos)
    const left = await client.query(`SELECT count(*)::int n FROM ${SCHEMA}.usuarios WHERE casal_id=$1`, [oldCasal]);
    if (left.rows[0].n === 0) await client.query(`DELETE FROM ${SCHEMA}.casais WHERE id=$1`, [oldCasal]);

    await client.query('COMMIT');
    const me = await getMe(req.uid);
    res.json(me);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('join', e);
    res.status(500).json({ erro: 'Erro ao entrar no casal.' });
  } finally {
    client.release();
  }
});

app.get('/api/state', auth, async (req, res) => {
  try {
    const me = await getMe(req.uid);
    const r = await q(`SELECT dados, atualizado_em, atualizado_por FROM ${SCHEMA}.estado WHERE casal_id=$1`, [me.casal.id]);
    if (!r.rowCount) return res.json({ dados: null, atualizado_em: null });
    res.json({ dados: r.rows[0].dados, atualizado_em: r.rows[0].atualizado_em, atualizado_por: r.rows[0].atualizado_por });
  } catch (e) {
    console.error('get state', e);
    res.status(500).json({ erro: 'Erro ao buscar dados.' });
  }
});

app.put('/api/state', auth, async (req, res) => {
  try {
    const dados = req.body.dados;
    if (typeof dados !== 'object' || dados === null) return res.status(400).json({ erro: 'Dados inválidos.' });
    const me = await getMe(req.uid);
    const r = await q(
      `INSERT INTO ${SCHEMA}.estado (casal_id, dados, atualizado_em, atualizado_por)
       VALUES ($1,$2,now(),$3)
       ON CONFLICT (casal_id) DO UPDATE SET dados=EXCLUDED.dados, atualizado_em=now(), atualizado_por=EXCLUDED.atualizado_por
       RETURNING atualizado_em`,
      [me.casal.id, dados, req.uid]
    );
    res.json({ atualizado_em: r.rows[0].atualizado_em });
  } catch (e) {
    console.error('put state', e);
    res.status(500).json({ erro: 'Erro ao salvar.' });
  }
});

/* ---------- notificações push (Web Push / VAPID) ---------- */
// Chave pública para o navegador assinar (não precisa de auth)
app.get('/api/push/key', (req, res) => res.json({ publicKey: push.getPublicKey() }));

app.post('/api/push/subscribe', auth, async (req, res) => {
  try {
    const sub = req.body.subscription;
    if (!sub || !sub.endpoint || !sub.keys || !sub.keys.p256dh || !sub.keys.auth)
      return res.status(400).json({ erro: 'Subscription inválida.' });
    const me = await getMe(req.uid);
    await q(
      `INSERT INTO ${SCHEMA}.push_subs (usuario_id, casal_id, endpoint, p256dh, auth)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (endpoint) DO UPDATE SET usuario_id=EXCLUDED.usuario_id, casal_id=EXCLUDED.casal_id, p256dh=EXCLUDED.p256dh, auth=EXCLUDED.auth`,
      [req.uid, me.casal.id, sub.endpoint, sub.keys.p256dh, sub.keys.auth]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error('subscribe', e);
    res.status(500).json({ erro: 'Erro ao registrar notificações.' });
  }
});

app.post('/api/push/unsubscribe', auth, async (req, res) => {
  try {
    const ep = req.body.endpoint;
    if (ep) await q(`DELETE FROM ${SCHEMA}.push_subs WHERE endpoint=$1 AND usuario_id=$2`, [ep, req.uid]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ erro: 'Erro ao remover.' });
  }
});

app.post('/api/push/test', auth, async (req, res) => {
  try {
    const n = await push.sendToUser(req.uid, {
      title: 'Financeiro do Casal 💑',
      body: '🔔 Tudo certo! É assim que os lembretes vão chegar — mesmo com o app fechado.',
      url: 'index.html?go=alertas', tag: 'teste',
    });
    res.json({ enviados: n });
  } catch (e) {
    console.error('push test', e);
    res.status(500).json({ erro: 'Erro ao enviar teste.' });
  }
});

/* ---------- IA (OpenRouter) ---------- */
app.get('/api/ai/status', (req, res) => res.json({ enabled: ai.ENABLED, modelo: ai.ENABLED ? ai.MODEL : null }));

app.post('/api/ai/coach', auth, async (req, res) => {
  if (!ai.ENABLED) return res.status(503).json({ erro: 'IA não configurada no servidor.' });
  const pergunta = (req.body.pergunta || '').toString().slice(0, 600).trim();
  if (!pergunta) return res.status(400).json({ erro: 'Escreva uma pergunta.' });
  try {
    const me = await getMe(req.uid);
    const est = await q(`SELECT dados FROM ${SCHEMA}.estado WHERE casal_id=$1`, [me.casal.id]);
    const resposta = await ai.coach(est.rowCount ? est.rows[0].dados : {}, pergunta);
    res.json({ resposta });
  } catch (e) {
    console.error('ai coach', e.message);
    res.status(502).json({ erro: 'A IA não respondeu agora. Tente novamente em instantes.' });
  }
});

// Dica do dia personalizada (cacheada por casal/dia para economizar tokens)
app.get('/api/ai/daily', auth, async (req, res) => {
  if (!ai.ENABLED) return res.json({ enabled: false, texto: null });
  try {
    const me = await getMe(req.uid);
    const { dateStr } = push.tzNow();
    const ckey = `aidaily:${me.casal.id}:${dateStr}`;
    const cached = await q(`SELECT valor FROM ${SCHEMA}.config WHERE chave=$1`, [ckey]);
    if (cached.rowCount) return res.json({ enabled: true, texto: cached.rows[0].valor.texto });
    const est = await q(`SELECT dados FROM ${SCHEMA}.estado WHERE casal_id=$1`, [me.casal.id]);
    const texto = await ai.dicaDoDia(est.rowCount ? est.rows[0].dados : {});
    await q(`INSERT INTO ${SCHEMA}.config (chave, valor) VALUES ($1,$2) ON CONFLICT (chave) DO UPDATE SET valor=EXCLUDED.valor`, [ckey, JSON.stringify({ texto })]);
    res.json({ enabled: true, texto });
  } catch (e) {
    console.error('ai daily', e.message);
    res.json({ enabled: true, texto: null, erro: true });
  }
});

migrate()
  .then(() => push.ensureVapid())
  .then(() => { push.startScheduler(); app.listen(PORT, () => console.log(`[api] ouvindo na porta ${PORT}`)); })
  .catch((e) => { console.error('Falha ao iniciar:', e); process.exit(1); });
