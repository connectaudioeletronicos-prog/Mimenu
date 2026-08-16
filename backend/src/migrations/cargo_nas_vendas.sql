-- ===================================================================
-- Cargo junto do nome em cada venda (comanda / pedido)
-- ---------------------------------------------------------------------
-- So o nome nao basta: se a loja tem "Admin 1" e "Admin 2", os dois sao
-- administrador, mas sao pessoas diferentes, cada uma com seu proprio
-- login -- e o proprietario tambem pode aparecer como operador (sem
-- ser um "funcionario" cadastrado). Esses campos guardam o CARGO de
-- quem atendeu/vendeu/recebeu no momento da acao, pra exibir sempre
-- como "Nome (Cargo)" -- ex: "Admin 1 (Administrador)", "Someone
-- (Caixa)", "Proprietário".
-- ===================================================================

ALTER TABLE comandas ADD COLUMN IF NOT EXISTS funcionario_cargo VARCHAR(30);
ALTER TABLE comandas ADD COLUMN IF NOT EXISTS fechada_por_funcionario_cargo VARCHAR(30);
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS lancado_por_funcionario_cargo VARCHAR(30);

-- Backfill pra registros antigos, usando o cargo ATUAL de cada
-- funcionario (o mais proximo que da pra saber sem ter guardado o
-- cargo no momento da acao).
UPDATE comandas c SET funcionario_cargo = f.cargo
FROM funcionarios f
WHERE c.funcionario_id = f.id AND c.funcionario_cargo IS NULL;

UPDATE comandas c SET fechada_por_funcionario_cargo = f.cargo
FROM funcionarios f
WHERE c.fechada_por_funcionario_id = f.id AND c.fechada_por_funcionario_cargo IS NULL;

-- Vendas marcadas como "Proprietário" (funcionario_id nulo, nome
-- preenchido) nao tem linha em funcionarios -- o cargo e sempre
-- 'proprietario' nesse caso.
UPDATE comandas SET fechada_por_funcionario_cargo = 'proprietario'
WHERE fechada_por_funcionario_id IS NULL AND fechada_por_funcionario_nome = 'Proprietário' AND fechada_por_funcionario_cargo IS NULL;

UPDATE pedidos p SET lancado_por_funcionario_cargo = f.cargo
FROM funcionarios f
WHERE p.lancado_por_funcionario_id = f.id AND p.lancado_por_funcionario_cargo IS NULL;

UPDATE pedidos SET lancado_por_funcionario_cargo = 'proprietario'
WHERE lancado_por_funcionario_id IS NULL AND lancado_por_funcionario_nome = 'Proprietário' AND lancado_por_funcionario_cargo IS NULL;
