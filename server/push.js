const webpush = require('web-push');
const { pool, SCHEMA } = require('./db');

const TZ = process.env.APP_TZ || 'America/Sao_Paulo';
const DIGEST_HOUR = parseInt(process.env.DIGEST_HOUR || '8', 10); // hora local para o resumo diário
let publicKey = null;
let ready = false;

/* ---------- VAPID (chaves persistentes) ---------- */
async function ensureVapid() {
  let pub = process.env.VAPID_PUBLIC_KEY;
  let priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:contato@financeiro-casal.app';
  if (!pub || !priv) {
    const r = await pool.query(`SELECT valor FROM ${SCHEMA}.config WHERE chave='vapid'`);
    if (r.rowCount) {
      pub = r.rows[0].valor.publicKey;
      priv = r.rows[0].valor.privateKey;
    } else {
      const keys = webpush.generateVAPIDKeys();
      await pool.query(
        `INSERT INTO ${SCHEMA}.config (chave, valor) VALUES ('vapid', $1) ON CONFLICT (chave) DO NOTHING`,
        [JSON.stringify(keys)]
      );
      const r2 = await pool.query(`SELECT valor FROM ${SCHEMA}.config WHERE chave='vapid'`);
      pub = r2.rows[0].valor.publicKey;
      priv = r2.rows[0].valor.privateKey;
    }
  }
  webpush.setVapidDetails(subject, pub, priv);
  publicKey = pub;
  ready = true;
  console.log('[push] VAPID pronto. Resumo diário às %dh (%s).', DIGEST_HOUR, TZ);
}
const getPublicKey = () => publicKey;

/* ---------- envio ---------- */
async function sendToSubs(subs, payload) {
  const str = JSON.stringify(payload);
  let enviados = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, str);
      enviados++;
    } catch (e) {
      // 404/410 = inscrição expirada → remove
      if (e.statusCode === 404 || e.statusCode === 410) {
        await pool.query(`DELETE FROM ${SCHEMA}.push_subs WHERE endpoint=$1`, [s.endpoint]).catch(() => {});
      } else {
        console.error('[push] falha ao enviar:', e.statusCode || e.message);
      }
    }
  }
  return enviados;
}
async function sendToCasal(casalId, payload) {
  const r = await pool.query(`SELECT endpoint, p256dh, auth FROM ${SCHEMA}.push_subs WHERE casal_id=$1`, [casalId]);
  return sendToSubs(r.rows, payload);
}
async function sendToUser(userId, payload) {
  const r = await pool.query(`SELECT endpoint, p256dh, auth FROM ${SCHEMA}.push_subs WHERE usuario_id=$1`, [userId]);
  return sendToSubs(r.rows, payload);
}

/* ---------- datas no fuso do app ---------- */
function tzNow() {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false });
  const p = Object.fromEntries(f.formatToParts(new Date()).map(x => [x.type, x.value]));
  return { dateStr: `${p.year}-${p.month}-${p.day}`, hour: parseInt(p.hour, 10) };
}
function addDaysStr(iso, n) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const brl = n => 'R$ ' + (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ---------- monta o resumo diário a partir do estado do casal ---------- */
function computeDigest(dados, today, tomorrow) {
  dados = dados || {};
  const chores = (dados.chores || []).filter(c => !c.done && c.due);
  const overdue = chores.filter(c => c.due < today);
  const todayCh = chores.filter(c => c.due === today);
  const tmrCh = chores.filter(c => c.due === tomorrow);
  const todayDay = +today.slice(8, 10), tmrDay = +tomorrow.slice(8, 10);
  const debts = (dados.debts || []).filter(d => d && d.venc);
  const debtsToday = debts.filter(d => +d.venc === todayDay);
  const debtsTmr = debts.filter(d => +d.venc === tmrDay);

  const lines = [];
  if (todayCh.length) lines.push('📌 Hoje: ' + todayCh.slice(0, 3).map(c => c.title).join(', ') + (todayCh.length > 3 ? '…' : ''));
  if (debtsToday.length) lines.push('💳 Vence hoje: ' + debtsToday.map(d => d.nome + (d.total ? ' (' + brl(d.tipo === 'cartao' ? d.total : d.total / (d.parc || 1)) + ')' : '')).join(', '));
  if (overdue.length) lines.push('⚠️ ' + overdue.length + (overdue.length === 1 ? ' tarefa atrasada' : ' tarefas atrasadas'));
  const tmr = [...tmrCh.map(c => c.title), ...debtsTmr.map(d => d.nome)];
  if (tmr.length) lines.push('📅 Amanhã: ' + tmr.slice(0, 3).join(', '));

  return { has: lines.length > 0, title: 'Financeiro do Casal 💑', body: lines.join('\n') };
}

/* ---------- tick do agendador: 1 resumo por casal por dia ---------- */
async function tick() {
  if (!ready) return;
  const { dateStr, hour } = tzNow();
  if (hour < DIGEST_HOUR) return; // só de manhã em diante
  const tomorrow = addDaysStr(dateStr, 1);
  const casais = await pool.query(`SELECT DISTINCT casal_id FROM ${SCHEMA}.push_subs`);
  for (const row of casais.rows) {
    const cid = row.casal_id;
    try {
      const est = await pool.query(`SELECT dados FROM ${SCHEMA}.estado WHERE casal_id=$1`, [cid]);
      if (!est.rowCount) continue;
      const dig = computeDigest(est.rows[0].dados || {}, dateStr, tomorrow);
      if (!dig.has) continue;
      // dedupe: marca antes de enviar (evita duplicar entre ticks/reinícios)
      const ins = await pool.query(
        `INSERT INTO ${SCHEMA}.lembretes_enviados (casal_id, chave) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING 1`,
        [cid, 'digest:' + dateStr]
      );
      if (!ins.rowCount) continue;
      await sendToCasal(cid, { title: dig.title, body: dig.body, url: 'index.html?go=alertas', tag: 'digest-' + dateStr });
    } catch (e) {
      console.error('[push] tick casal', cid, e.message);
    }
  }
}
function startScheduler() {
  setInterval(() => tick().catch(e => console.error('[push] tick', e)), 15 * 60 * 1000);
  setTimeout(() => tick().catch(() => {}), 8000); // primeira passada logo após subir
}

module.exports = { ensureVapid, getPublicKey, sendToCasal, sendToUser, startScheduler, computeDigest, tick, tzNow, addDaysStr };
