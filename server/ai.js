// Integração com OpenRouter (proxy de IA). A chave fica SÓ no servidor.
const KEY = process.env.OPENROUTER_API_KEY || '';
const MODEL = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';
const REFERER = process.env.OPENROUTER_REFERER || 'https://financeiro-casal.app';
const ENABLED = !!KEY;

const brl = n => 'R$ ' + (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const SYS = [
  'Você é um conselheiro financeiro acolhedor e prático para casais brasileiros.',
  'Responda SEMPRE em português do Brasil, de forma curta, clara e gentil (no máximo ~2 parágrafos ou uma lista curta).',
  'Use os dados do casal quando forem úteis e cite valores quando ajudar.',
  'Foque em organização, hábitos e harmonia financeira do casal.',
  'NÃO prometa retornos, não recomende investimentos específicos nem dê garantias.',
  'Quando fizer sentido, termine com um próximo passo concreto e simples.',
].join(' ');

// Resumo compacto do estado do casal para dar contexto à IA (economiza tokens).
function resumoFinanceiro(dados) {
  const d = dados || {};
  const people = d.people || ['Pessoa 1', 'Pessoa 2'];
  const tx = d.tx || [];
  const recIn = tx.filter(t => t.rec && t.type === 'in').reduce((s, t) => s + (t.val || 0), 0);
  const recOut = tx.filter(t => t.rec && t.type === 'out').reduce((s, t) => s + (t.val || 0), 0);
  const cats = {};
  tx.filter(t => t.type === 'out').forEach(t => { cats[t.cat || 'Outros'] = (cats[t.cat || 'Outros'] || 0) + (t.val || 0); });
  const topCats = Object.entries(cats).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([c, v]) => `${c}: ${brl(v)}`);
  const subs = tx.filter(t => t.rec && t.type === 'out');
  const debts = (d.debts || []).map(x => `${x.nome} (${x.tipo === 'cartao' ? 'cartão' : 'dívida'}, ${brl(x.total)})`);
  const goals = (d.goals || []).map(g => `${g.nome}: ${brl(g.atual)}/${brl(g.alvo)}`);
  const chores = (d.chores || []).filter(c => !c.done);

  const lines = [];
  lines.push(`Casal: ${people[0]} e ${people[1]}.`);
  lines.push(`Saldo em conta: ${brl(d.balance || 0)}.`);
  lines.push(`Receita recorrente/mês: ${brl(recIn)}. Despesa recorrente/mês: ${brl(recOut)}.`);
  if (topCats.length) lines.push(`Maiores gastos por categoria: ${topCats.join('; ')}.`);
  if (subs.length) lines.push(`${subs.length} assinaturas/recorrentes somando ${brl(subs.reduce((s, t) => s + (t.val || 0), 0))}/mês.`);
  if (debts.length) lines.push(`Cartões/dívidas: ${debts.join('; ')}.`);
  if (goals.length) lines.push(`Metas: ${goals.join('; ')}.`);
  const trips = (d.trips || []).map(t => `${t.destino} (guardado ${brl(t.guardado || 0)}${t.orcamento ? ' de ' + brl(t.orcamento) : ''}${t.inicio ? ', ' + t.inicio : ''})`);
  if (trips.length) lines.push(`Viagens planejadas: ${trips.join('; ')}.`);
  if (chores.length) lines.push(`${chores.length} afazeres de casa em aberto.`);
  return lines.join('\n');
}

async function chat(messages, maxTokens) {
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + KEY,
      'Content-Type': 'application/json',
      'HTTP-Referer': REFERER,
      'X-Title': 'Financeiro do Casal',
    },
    body: JSON.stringify({ model: MODEL, messages, max_tokens: maxTokens || 450, temperature: 0.7 }),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error('OpenRouter ' + r.status + ': ' + t.slice(0, 300));
  }
  const j = await r.json();
  return ((j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '').trim();
}

function coach(dados, pergunta) {
  return chat([
    { role: 'system', content: SYS },
    { role: 'user', content: 'Dados do casal:\n' + resumoFinanceiro(dados) + '\n\nPergunta do casal: ' + pergunta },
  ], 550);
}

function dicaDoDia(dados) {
  return chat([
    { role: 'system', content: SYS },
    { role: 'user', content: 'Dados do casal:\n' + resumoFinanceiro(dados) + '\n\nEscreva UMA dica do dia curta (1 a 2 frases), motivadora e específica para este casal, sobre dinheiro ou um conceito financeiro simples. Comece com um emoji. Sem saudação, só a dica.' },
  ], 120);
}

module.exports = { ENABLED, MODEL, coach, dicaDoDia, resumoFinanceiro };
