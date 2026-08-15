-- ===================================================================
-- Numero de comanda/pedido como comprovante de auditoria
-- ---------------------------------------------------------------------
-- ANTES: numero_comanda e numero_pedido eram BIGSERIAL -- uma unica
-- sequencia GLOBAL, compartilhada por TODOS os estabelecimentos da
-- plataforma (multi-tenant). Na pratica, do ponto de vista de UM
-- estabelecimento os numeros pulavam sem padrao (dependendo do que
-- outros estabelecimentos estavam criando ao mesmo tempo), o que
-- invalida o uso desse numero como comprovante confiavel pro cliente
-- ou pro funcionario.
--
-- AGORA: cada estabelecimento tem sua PROPRIA sequencia, que reinicia
-- em 1 todo dia 1 do mes (contadores_mensais, chave por
-- estabelecimento + tipo + ano-mes). O numero nunca se repete DENTRO
-- do mesmo mes pro mesmo estabelecimento -- e o suficiente pra servir
-- de prova (ninguem vai discutir uma cobranca de meses atras com o
-- mesmo numero de uma comanda de hoje).
-- ===================================================================

CREATE TABLE IF NOT EXISTS contadores_mensais (
    estabelecimento_id UUID NOT NULL REFERENCES estabelecimentos(id) ON DELETE CASCADE,
    tipo VARCHAR(20) NOT NULL, -- 'comanda' | 'pedido'
    ano_mes VARCHAR(7) NOT NULL, -- formato 'YYYY-MM', ex: '2026-08'
    ultimo_numero INT NOT NULL DEFAULT 0,
    PRIMARY KEY (estabelecimento_id, tipo, ano_mes)
);

-- Remove o auto-incremento global -- o numero agora e sempre calculado
-- explicitamente na aplicacao (utils/numeracao.js) antes do INSERT.
ALTER TABLE comandas ALTER COLUMN numero_comanda DROP DEFAULT;
ALTER TABLE pedidos ALTER COLUMN numero_pedido DROP DEFAULT;

-- A antiga UNIQUE INDEX global nao faz mais sentido (o numero agora so
-- e unico dentro do par estabelecimento+mes, entao dois estabelecimentos
-- -- ou o mesmo estabelecimento em meses diferentes -- podem ter o
-- mesmo numero_comanda perfeitamente).
DROP INDEX IF EXISTS idx_comandas_numero_comanda;
DROP INDEX IF EXISTS idx_pedidos_numero_pedido;

-- Guarda em qual ano-mes aquele numero foi emitido -- necessario pra
-- exibir/consultar corretamente sem ambiguidade (numero 12 de agosto/2026
-- e um comprovante diferente do numero 12 de setembro/2026).
ALTER TABLE comandas ADD COLUMN IF NOT EXISTS numero_comanda_ano_mes VARCHAR(7);
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS numero_pedido_ano_mes VARCHAR(7);

CREATE INDEX IF NOT EXISTS idx_comandas_numero_periodo ON comandas(estabelecimento_id, numero_comanda_ano_mes, numero_comanda);
CREATE INDEX IF NOT EXISTS idx_pedidos_numero_periodo ON pedidos(estabelecimento_id, numero_pedido_ano_mes, numero_pedido);
