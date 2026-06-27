// ===================================================================
// Configuracao da conexao com o banco PostgreSQL (Supabase)
// ===================================================================
const { Pool } = require('pg');
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

module.exports = { pool, query };