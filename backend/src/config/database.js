// ===================================================================
// DESTINO: backend/src/config/database.js  (SUBSTITUI o arquivo atual)
// ===================================================================
// Configuracao da conexao com o banco PostgreSQL (Supabase)
// ===================================================================
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

pool.on('error', (err) => {
  console.error('Erro inesperado na conexao com o banco:', err);
});

async function query(text, params) {
  try {
    const result = await pool.query(text, params);
    return result;
  } catch (error) {
    console.error('Erro ao executar query:', error.message);
    throw error;
  }
}

// ===================================================================
// MIGRATIONS VERSIONADAS
// ---------------------------------------------------------------------
// Antes, o schema era "sincronizado" rodando ~18 blocos de ALTER/CREATE
// toda vez que o servidor subia -- funcionava (eram idempotentes), mas
// crescia pra sempre e rodava tudo de novo a cada boot, sem historico.
//
// Agora cada mudanca de schema fica num arquivo .sql numerado dentro de
// backend/src/migrations/. Uma tabela "schema_migrations" guarda quais
// arquivos ja foram aplicados; so os novos (ainda nao aplicados) rodam
// no proximo boot, em ordem, cada um dentro da sua propria transacao.
//
// Pra criar uma migration nova: adicione um arquivo em
// backend/src/migrations/ com o proximo numero (ex: 019_nome.sql).
// ===================================================================
async function migrar() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      versao VARCHAR(255) UNIQUE NOT NULL,
      executado_em TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  const pastaMigrations = path.join(__dirname, '..', 'migrations');

  if (!fs.existsSync(pastaMigrations)) {
    console.warn('Aviso: pasta de migrations nao encontrada em', pastaMigrations);
    return;
  }

  const arquivos = fs.readdirSync(pastaMigrations)
    .filter((nome) => nome.endsWith('.sql'))
    .sort(); // nomes numerados (001_..., 002_...) garantem a ordem certa

  const jaAplicadas = await pool.query('SELECT versao FROM schema_migrations');
  const aplicadasSet = new Set(jaAplicadas.rows.map((linha) => linha.versao));

  for (const arquivo of arquivos) {
    if (aplicadasSet.has(arquivo)) continue;

    const sql = fs.readFileSync(path.join(pastaMigrations, arquivo), 'utf8');
    const client = await pool.connect();
    try {
      // Trava de seguranca: se a migration ficar esperando um lock preso
      // (ex: instancia antiga do deploy anterior ainda fechando conexao
      // na mesma tabela), ela desiste rapido em vez de travar o boot
      // inteiro do servidor pra sempre (o que fazia o Render dar timeout
      // de porta, pq o app.listen() nunca era alcancado). Fica so pra
      // proxima tentativa de deploy.
      await client.query("SET lock_timeout = '8s'");
      await client.query("SET statement_timeout = '20s'");
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (versao) VALUES ($1)', [arquivo]);
      await client.query('COMMIT');
      console.log(`Migration aplicada: ${arquivo}`);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      console.error(`Aviso: falha ao aplicar migration ${arquivo}:`, error.message);
    } finally {
      client.release();
    }
  }
}

// Mantido com o nome antigo (sincronizarSchema) so pra nao precisar tocar
// em server.js -- por dentro, agora roda o sistema de migrations versionadas.
module.exports = { pool, query, sincronizarSchema: migrar };
