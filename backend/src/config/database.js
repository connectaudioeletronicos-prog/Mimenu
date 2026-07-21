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

  // Campos extras do cadastro de funcionario: telefone (rapido, no cadastro
  // inicial) e o cadastro completo opcional (celular, nascimento, RG, CPF),
  // preenchivel so por proprietario/administrador.
  try {
    await pool.query(`
      ALTER TABLE funcionarios ADD COLUMN IF NOT EXISTS telefone VARCHAR(20);
      ALTER TABLE funcionarios ADD COLUMN IF NOT EXISTS celular VARCHAR(20);
      ALTER TABLE funcionarios ADD COLUMN IF NOT EXISTS data_nascimento DATE;
      ALTER TABLE funcionarios ADD COLUMN IF NOT EXISTS rg VARCHAR(20);
      ALTER TABLE funcionarios ADD COLUMN IF NOT EXISTS cpf VARCHAR(14);
    `);
    console.log('Schema sincronizado: colunas de cadastro completo em funcionarios atualizadas.');
  } catch (error) {
    console.error('Aviso: nao foi possivel sincronizar colunas de funcionarios:', error.message);
  }

  try {
    await pool.query(`ALTER TABLE produtos ADD COLUMN IF NOT EXISTS estoque INTEGER;`);
    console.log('Schema sincronizado: coluna estoque em produtos atualizada.');
  } catch (error) {
    console.error('Aviso: nao foi possivel sincronizar estoque em produtos:', error.message);
  }

  try {
    await pool.query(`ALTER TABLE categorias ADD COLUMN IF NOT EXISTS descricao TEXT;`);
    console.log('Schema sincronizado: coluna descricao em categorias atualizada.');
  } catch (error) {
    console.error('Aviso: nao foi possivel sincronizar descricao em categorias:', error.message);
  }

  // Conta do aplicativo do cliente (diferente da tabela "clientes", que e
  // um registro simples por estabelecimento criado a cada pedido). Esta e
  // a conta de verdade, com login/senha, valida em qualquer loja Palatos.
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS contas_clientes (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        nome VARCHAR(100) NOT NULL,
        sobrenome VARCHAR(100) NOT NULL,
        email VARCHAR(150) NOT NULL UNIQUE,
        senha_hash TEXT NOT NULL,
        cpf VARCHAR(14) UNIQUE,
        cep VARCHAR(9),
        logradouro TEXT,
        numero VARCHAR(20),
        bairro VARCHAR(100),
        cidade VARCHAR(100),
        uf CHAR(2),
        reset_token VARCHAR(255),
        reset_token_expira TIMESTAMP,
        criado_em TIMESTAMP DEFAULT NOW(),
        atualizado_em TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_contas_clientes_email ON contas_clientes(email);
    `);
    console.log('Schema sincronizado: tabela contas_clientes verificada.');
  } catch (error) {
    console.error('Aviso: nao foi possivel sincronizar contas_clientes:', error.message);
  }

  // Permite login com Google na conta do cliente: guarda o ID unico do
  // Google (sub) e libera a senha para ser opcional (quem entra so pelo
  // Google nunca chega a definir uma senha nossa).
  try {
    await pool.query(`
      ALTER TABLE contas_clientes ADD COLUMN IF NOT EXISTS google_id VARCHAR(255) UNIQUE;
      ALTER TABLE contas_clientes ALTER COLUMN senha_hash DROP NOT NULL;
    `);
    console.log('Schema sincronizado: login com Google em contas_clientes atualizado.');
  } catch (error) {
    console.error('Aviso: nao foi possivel sincronizar login Google em contas_clientes:', error.message);
  }
}

module.exports = { pool, query, sincronizarSchema };
