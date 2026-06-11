/**
 * Cria (ou atualiza a senha de) um usuário direto no banco.
 * Útil para criar a primeira conta sem precisar abrir o app.
 *
 * Como rodar (dentro do container/servidor, onde o banco é acessível):
 *   node criar-usuario.js "Nome" "email@exemplo.com" "minhaSenha123"
 *
 * Ou por variáveis de ambiente:
 *   NOME="Nome" EMAIL="email@exemplo.com" SENHA="minhaSenha123" node criar-usuario.js
 *
 * Precisa da variável DATABASE_URL definida (o mesmo do app).
 * Se o e-mail já existir, ele apenas ATUALIZA a senha (não duplica).
 */
const bcrypt = require('bcryptjs');
const { pool, migrate, SCHEMA } = require('./db');

async function main() {
  const nome = (process.argv[2] || process.env.NOME || '').trim();
  const email = (process.argv[3] || process.env.EMAIL || '').trim().toLowerCase();
  const senha = process.argv[4] || process.env.SENHA || '';

  if (!nome || !email || senha.length < 6) {
    console.error('Uso: node criar-usuario.js "Nome" "email@exemplo.com" "senha (mín. 6)"');
    process.exit(1);
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    console.error('E-mail inválido:', email);
    process.exit(1);
  }

  // Garante que o schema/tabelas existem (idempotente).
  await migrate();

  const hash = await bcrypt.hash(senha, 10);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query(
      `SELECT id FROM ${SCHEMA}.usuarios WHERE lower(email)=lower($1)`, [email]
    );

    if (existing.rowCount) {
      await client.query(
        `UPDATE ${SCHEMA}.usuarios SET senha_hash=$1, nome=$2 WHERE id=$3`,
        [hash, nome, existing.rows[0].id]
      );
      await client.query('COMMIT');
      console.log(`✓ Usuário já existia — senha/nome ATUALIZADOS.`);
      console.log(`  Nome:  ${nome}`);
      console.log(`  Email: ${email}`);
    } else {
      const casal = await client.query(`INSERT INTO ${SCHEMA}.casais DEFAULT VALUES RETURNING id`);
      const casalId = casal.rows[0].id;
      const ins = await client.query(
        `INSERT INTO ${SCHEMA}.usuarios (nome, email, senha_hash, casal_id) VALUES ($1,$2,$3,$4) RETURNING id`,
        [nome, email, hash, casalId]
      );
      await client.query(
        `INSERT INTO ${SCHEMA}.estado (casal_id, dados) VALUES ($1,'{}'::jsonb)
         ON CONFLICT (casal_id) DO NOTHING`, [casalId]
      );
      await client.query('COMMIT');
      console.log(`✓ Usuário CRIADO com sucesso!`);
      console.log(`  Nome:    ${nome}`);
      console.log(`  Email:   ${email}`);
      console.log(`  User ID: ${ins.rows[0].id}`);
      console.log(`  Casal ID:${casalId}`);
    }
    console.log('\nAgora é só entrar no app com esse e-mail e senha. 💑');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Erro ao criar usuário:', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
