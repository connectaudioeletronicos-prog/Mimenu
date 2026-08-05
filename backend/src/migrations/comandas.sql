-- Uma "comanda" e o guarda-chuva de uma mesa/cliente enquanto ela esta
-- aberta: cada vez que o garcom manda uma rodada de itens pra cozinha, cria
-- um pedido novo vinculado a essa comanda (pedidos.comanda_id). O
-- pagamento (forma_pagamento, gorjeta, Pix) so acontece quando a comanda
-- fecha -- por isso essas colunas ficam aqui, nao em pedidos.
CREATE TABLE IF NOT EXISTS comandas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    estabelecimento_id UUID NOT NULL REFERENCES estabelecimentos(id) ON DELETE CASCADE,
    funcionario_id UUID REFERENCES funcionarios(id),
    funcionario_nome VARCHAR(150),
    mesa_cliente VARCHAR(150) NOT NULL,
    observacao TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'aberta', -- aberta | fechada
    subtotal NUMERIC(10,2) NOT NULL DEFAULT 0,
    gorjeta NUMERIC(10,2) NOT NULL DEFAULT 0,
    total NUMERIC(10,2) NOT NULL DEFAULT 0,
    forma_pagamento VARCHAR(30),
    status_pagamento VARCHAR(30) DEFAULT 'pendente',
    mp_payment_id VARCHAR(100),
    pix_qr_code TEXT,
    pix_qr_code_base64 TEXT,
    pix_expira_em TIMESTAMP,
    aberta_em TIMESTAMP NOT NULL DEFAULT NOW(),
    fechada_em TIMESTAMP,
    fechada_por_funcionario_id UUID REFERENCES funcionarios(id),
    fechada_por_funcionario_nome VARCHAR(150)
);

CREATE INDEX IF NOT EXISTS idx_comandas_estabelecimento ON comandas(estabelecimento_id);
CREATE INDEX IF NOT EXISTS idx_comandas_status ON comandas(estabelecimento_id, status);
CREATE INDEX IF NOT EXISTS idx_comandas_mp_payment_id ON comandas(mp_payment_id);

-- Toda rodada de itens mandada pra cozinha dentro de uma comanda aberta vira
-- um pedido de verdade (pra continuar aparecendo normalmente no painel da
-- cozinha), so que vinculado a comanda que vai pagar por ele.
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS comanda_id UUID REFERENCES comandas(id);
CREATE INDEX IF NOT EXISTS idx_pedidos_comanda_id ON pedidos(comanda_id);
