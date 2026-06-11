const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('FALTA a variável DATABASE_URL.');
  process.exit(1);
}

// ssl: o banco está com sslmode na própria string; respeitamos isso.
// Se a string pedir SSL mas o certificado for self-signed, não derrubamos a conexão.
const useSSL = /sslmode=require|sslmode=verify/.test(process.env.DATABASE_URL);
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: useSSL ? { rejectUnauthorized: false } : false,
  max: 8,
  idleTimeoutMillis: 30000,
});

// Tudo isolado no schema financeiro_casal — não toca em nenhuma tabela existente.
const SCHEMA = process.env.DB_SCHEMA || 'financeiro_casal';

async function migrate() {
  const q = (s) => pool.query(s);
  await q(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`);
  await q(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA}.casais (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      criado_em timestamptz NOT NULL DEFAULT now()
    )`);
  await q(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA}.usuarios (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email text NOT NULL,
      nome text NOT NULL,
      senha_hash text NOT NULL,
      casal_id uuid NOT NULL REFERENCES ${SCHEMA}.casais(id) ON DELETE CASCADE,
      criado_em timestamptz NOT NULL DEFAULT now()
    )`);
  await q(`CREATE UNIQUE INDEX IF NOT EXISTS usuarios_email_uidx ON ${SCHEMA}.usuarios (lower(email))`);
  await q(`CREATE INDEX IF NOT EXISTS usuarios_casal_idx ON ${SCHEMA}.usuarios (casal_id)`);
  await q(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA}.convites (
      codigo text PRIMARY KEY,
      casal_id uuid NOT NULL REFERENCES ${SCHEMA}.casais(id) ON DELETE CASCADE,
      criado_por uuid NOT NULL REFERENCES ${SCHEMA}.usuarios(id) ON DELETE CASCADE,
      criado_em timestamptz NOT NULL DEFAULT now(),
      expira_em timestamptz NOT NULL,
      usado boolean NOT NULL DEFAULT false
    )`);
  await q(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA}.estado (
      casal_id uuid PRIMARY KEY REFERENCES ${SCHEMA}.casais(id) ON DELETE CASCADE,
      dados jsonb NOT NULL DEFAULT '{}'::jsonb,
      atualizado_em timestamptz NOT NULL DEFAULT now(),
      atualizado_por uuid
    )`);
  // --- notificações push ---
  await q(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA}.push_subs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      usuario_id uuid NOT NULL REFERENCES ${SCHEMA}.usuarios(id) ON DELETE CASCADE,
      casal_id uuid NOT NULL REFERENCES ${SCHEMA}.casais(id) ON DELETE CASCADE,
      endpoint text NOT NULL UNIQUE,
      p256dh text NOT NULL,
      auth text NOT NULL,
      criado_em timestamptz NOT NULL DEFAULT now()
    )`);
  await q(`CREATE INDEX IF NOT EXISTS push_subs_casal_idx ON ${SCHEMA}.push_subs (casal_id)`);
  await q(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA}.config (
      chave text PRIMARY KEY,
      valor jsonb NOT NULL,
      atualizado_em timestamptz NOT NULL DEFAULT now()
    )`);
  await q(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA}.lembretes_enviados (
      casal_id uuid NOT NULL REFERENCES ${SCHEMA}.casais(id) ON DELETE CASCADE,
      chave text NOT NULL,
      enviado_em timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (casal_id, chave)
    )`);
  console.log(`[db] schema "${SCHEMA}" pronto.`);
}

module.exports = { pool, migrate, SCHEMA };
