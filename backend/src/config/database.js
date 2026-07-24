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
        CHECK (cargo IN ('administrador', 'gerente', 'caixa', 'garcom', 'colaborador', 'cozinha', 'entregador'));
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

  // E-mail agora e opcional no cadastro do cliente (ele pode entrar so com
  // telefone). Pelo menos um dos dois (email ou telefone) e exigido pela
  // aplicacao na hora do cadastro/login, nao pelo banco.
  try {
    await pool.query(`
      ALTER TABLE contas_clientes ALTER COLUMN email DROP NOT NULL;
      ALTER TABLE contas_clientes ADD COLUMN IF NOT EXISTS telefone VARCHAR(20) UNIQUE;
    `);
    console.log('Schema sincronizado: email opcional e telefone em contas_clientes atualizado.');
  } catch (error) {
    console.error('Aviso: nao foi possivel sincronizar telefone em contas_clientes:', error.message);
  }

  // Reserva de mesa: recurso opcional por loja (fica desligado ate o
  // lojista ativar na aba Configuracoes do painel).
  try {
    await pool.query(`
      ALTER TABLE estabelecimentos ADD COLUMN IF NOT EXISTS reserva_mesa_ativa BOOLEAN DEFAULT false;

      CREATE TABLE IF NOT EXISTS reservas (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        estabelecimento_id UUID NOT NULL REFERENCES estabelecimentos(id) ON DELETE CASCADE,
        cliente_nome VARCHAR(150) NOT NULL,
        cliente_telefone VARCHAR(20) NOT NULL,
        data_reserva DATE NOT NULL,
        horario_reserva VARCHAR(5) NOT NULL,
        quantidade_pessoas INT NOT NULL,
        observacoes TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'pendente',
        criado_em TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_reservas_estabelecimento ON reservas(estabelecimento_id);
    `);
    console.log('Schema sincronizado: reserva de mesa (config + tabela reservas) verificada.');
  } catch (error) {
    console.error('Aviso: nao foi possivel sincronizar reserva de mesa:', error.message);
  }

  // Permite vincular uma imagem do carrossel (ou uma vitrine inteira) a um
  // produto do cardapio: ao tocar na imagem, o cliente ve direto a pagina
  // daquele produto. Fica opcional (null = imagem so ilustrativa).
  try {
    await pool.query(`
      ALTER TABLE carrossel_imagens ADD COLUMN IF NOT EXISTS produto_id UUID REFERENCES produtos(id) ON DELETE SET NULL;
      ALTER TABLE vitrines ADD COLUMN IF NOT EXISTS produto_id UUID REFERENCES produtos(id) ON DELETE SET NULL;
    `);
    console.log('Schema sincronizado: vinculo de produto em carrossel/vitrine atualizado.');
  } catch (error) {
    console.error('Aviso: nao foi possivel sincronizar vinculo de produto em carrossel/vitrine:', error.message);
  }

  // Tempo estimado de preparo (minutos), configuravel pelo lojista e
  // exibido ao cliente tanto na retirada quanto no delivery.
  try {
    await pool.query(`
      ALTER TABLE estabelecimentos ADD COLUMN IF NOT EXISTS tempo_preparo_min INT DEFAULT 30;
    `);
    console.log('Schema sincronizado: tempo_preparo_min em estabelecimentos.');
  } catch (error) {
    console.error('Aviso: nao foi possivel sincronizar tempo_preparo_min:', error.message);
  }

  // Pedido para retirar no local usa a coluna tipo_pedido que ja existia
  // (valor 'retirada', ao lado do 'entrega' que ja era o padrao). Gorjeta
  // e nova: opcional, informada pelo cliente no fechamento do pedido.
  try {
    await pool.query(`
      ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS gorjeta NUMERIC(10,2) DEFAULT 0;
    `);
    console.log('Schema sincronizado: gorjeta em pedidos.');
  } catch (error) {
    console.error('Aviso: nao foi possivel sincronizar gorjeta em pedidos:', error.message);
  }

  // Equipe operacional (cozinha/entregador) + fila de entrega automatica.
  // disponivel_entrega/ultima_fila_em/total_entregas so tem sentido pra
  // cargo = 'entregador', mas ficam disponiveis na tabela toda por
  // simplicidade (mesmo padrao ja usado pros campos de cadastro completo).
  try {
    await pool.query(`
      ALTER TABLE funcionarios ADD COLUMN IF NOT EXISTS disponivel_entrega BOOLEAN DEFAULT true;
      ALTER TABLE funcionarios ADD COLUMN IF NOT EXISTS ultima_fila_em TIMESTAMP DEFAULT NOW();
      ALTER TABLE funcionarios ADD COLUMN IF NOT EXISTS total_entregas INT DEFAULT 0;
    `);
    console.log('Schema sincronizado: colunas de fila/disponibilidade de entregadores em funcionarios.');
  } catch (error) {
    console.error('Aviso: nao foi possivel sincronizar colunas de entregadores em funcionarios:', error.message);
  }

  // Carga horaria (opcional) de cada funcionario: dias da semana + horario
  // de entrada/saida. Guardado como JSONB pra nao precisar de tabela nova
  // pra um unico turno por funcionario.
  try {
    await pool.query(`
      ALTER TABLE funcionarios ADD COLUMN IF NOT EXISTS carga_horaria JSONB DEFAULT '{}';
    `);
    console.log('Schema sincronizado: carga_horaria em funcionarios.');
  } catch (error) {
    console.error('Aviso: nao foi possivel sincronizar carga_horaria em funcionarios:', error.message);
  }

  // Pedido saiu para entrega -> atribuido automaticamente ao proximo
  // entregador da fila (por ordem de chegada). Guarda quem ficou responsavel
  // e os horarios de "pronto" e "saiu para entrega" pra rastreio/relatorios.
  try {
    await pool.query(`
      ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS entregador_id UUID REFERENCES funcionarios(id) ON DELETE SET NULL;
      ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS entregador_nome VARCHAR(150);
      ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS horario_pronto TIMESTAMP;
      ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS horario_saiu_entrega TIMESTAMP;
    `);
    console.log('Schema sincronizado: colunas de entregador/horarios em pedidos.');
  } catch (error) {
    console.error('Aviso: nao foi possivel sincronizar colunas de entrega em pedidos:', error.message);
  }
}

module.exports = { pool, query, sincronizarSchema };
