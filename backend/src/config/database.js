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

// Garante que a constraint funcionarios_cargo_check no banco esteja sempre
// alinhada com a lista CARGOS_VALIDOS usada no codigo (funcionarioController.js).
// Roda automaticamente a cada start do servidor -- e idempotente, entao pode
// rodar quantas vezes for preciso sem problema.
async function sincronizarSchema() {
  try {
    await pool.query(`
      ALTER TABLE funcionarios DROP CONSTRAINT IF EXISTS funcionarios_cargo_check;
      ALTER TABLE funcionarios ADD CONSTRAINT funcionarios_cargo_check
        CHECK (cargo IN ('administrador', 'gerente', 'caixa', 'garcom', 'colaborador'));
    `);
    console.log('Schema sincronizado: constraint funcionarios_cargo_check atualizada.');
  } catch (error) {
    console.error('Aviso: nao foi possivel sincronizar funcionarios_cargo_check:', error.message);
  }

  // Permite posicionar carrosseis/vitrines logo apos uma categoria especifica
  // (formato "apos-categoria:<uuid>"), alem dos pontos fixos de sempre.
  // A coluna precisa ser maior pra caber esse formato, e a constraint antiga
  // (se existir) precisa ser removida, senao o INSERT/UPDATE e recusado.
  try {
    await pool.query(`
      ALTER TABLE carrosseis ALTER COLUMN posicao TYPE VARCHAR(80);
      ALTER TABLE carrosseis DROP CONSTRAINT IF EXISTS carrosseis_posicao_check;
    `);
    console.log('Schema sincronizado: coluna/constraint de posicao em carrosseis atualizada.');
  } catch (error) {
    console.error('Aviso: nao foi possivel sincronizar posicao em carrosseis:', error.message);
  }

  try {
    await pool.query(`
      ALTER TABLE vitrines ALTER COLUMN posicao TYPE VARCHAR(80);
      ALTER TABLE vitrines DROP CONSTRAINT IF EXISTS vitrines_posicao_check;
    `);
    console.log('Schema sincronizado: coluna/constraint de posicao em vitrines atualizada.');
  } catch (error) {
    console.error('Aviso: nao foi possivel sincronizar posicao em vitrines:', error.message);
  }

  try {
    await pool.query(`
      ALTER TABLE caixas_texto ALTER COLUMN posicao TYPE VARCHAR(80);
      ALTER TABLE caixas_texto DROP CONSTRAINT IF EXISTS caixas_texto_posicao_check;
    `);
    console.log('Schema sincronizado: coluna/constraint de posicao em caixas_texto atualizada.');
  } catch (error) {
    console.error('Aviso: nao foi possivel sincronizar posicao em caixas_texto:', error.message);
  }
}

module.exports = { pool, query, sincronizarSchema };
