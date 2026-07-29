-- Conta do aplicativo do cliente (diferente da tabela "clientes", que e
-- um registro simples por estabelecimento criado a cada pedido). Esta e
-- a conta de verdade, com login/senha, valida em qualquer loja Palatos.
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
