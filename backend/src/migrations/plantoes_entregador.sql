-- Plantao do entregador: valor por entrega/km configurado no cadastro do
-- funcionario, plus a tabela que registra cada plantao (inicio/fim/totais)
-- pra fechar o resumo mostrado no app do entregador.

ALTER TABLE funcionarios ADD COLUMN IF NOT EXISTS forma_pagamento_entrega VARCHAR(20) DEFAULT 'entrega';
ALTER TABLE funcionarios ADD COLUMN IF NOT EXISTS valor_por_entrega NUMERIC(10,2) DEFAULT 0;
ALTER TABLE funcionarios ADD COLUMN IF NOT EXISTS valor_por_km NUMERIC(10,2) DEFAULT 0;

CREATE TABLE IF NOT EXISTS plantoes_entregador (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  estabelecimento_id UUID NOT NULL REFERENCES estabelecimentos(id) ON DELETE CASCADE,
  funcionario_id UUID NOT NULL REFERENCES funcionarios(id) ON DELETE CASCADE,
  inicio TIMESTAMP NOT NULL DEFAULT NOW(),
  fim TIMESTAMP,
  total_entregas INT DEFAULT 0,
  total_km NUMERIC(10,2) DEFAULT 0,
  valor_total NUMERIC(10,2) DEFAULT 0
);

-- Garante que so exista um plantao aberto por vez por entregador (o
-- checkinEntregador confia nesse indice pra nao duplicar com o
-- "WHERE NOT EXISTS ... ON CONFLICT" implicito da query de insercao).
CREATE UNIQUE INDEX IF NOT EXISTS idx_plantao_aberto_unico
  ON plantoes_entregador (funcionario_id)
  WHERE fim IS NULL;

ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS distancia_km NUMERIC(10,2);
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS plantao_id UUID REFERENCES plantoes_entregador(id) ON DELETE SET NULL;
