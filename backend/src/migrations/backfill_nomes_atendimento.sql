-- ===================================================================
-- Backfill do nome de quem atendeu/fechou comandas antigas
-- ---------------------------------------------------------------------
-- Antes da correcao em backend/src/middlewares/auth.js, req.funcionarioNome
-- nunca era preenchido -- entao toda comanda aberta ou fechada ANTES
-- desse deploy ficou com funcionario_nome / fechada_por_funcionario_nome
-- em branco no banco, mesmo o funcionario_id/fechada_por_funcionario_id
-- (que dependem de outra parte do token) ja estando certos.
--
-- Esse UPDATE so PREENCHE o que esta faltando -- nao mexe em nada que
-- ja tem valor certo -- usando o nome ATUAL do funcionario cadastrado.
-- Rodar uma vez, depois do deploy do auth.js corrigido.
-- ===================================================================

UPDATE comandas c
SET funcionario_nome = f.nome
FROM funcionarios f
WHERE c.funcionario_id = f.id
  AND (c.funcionario_nome IS NULL OR c.funcionario_nome = '');

UPDATE comandas c
SET fechada_por_funcionario_nome = f.nome
FROM funcionarios f
WHERE c.fechada_por_funcionario_id = f.id
  AND (c.fechada_por_funcionario_nome IS NULL OR c.fechada_por_funcionario_nome = '');

UPDATE pedidos p
SET lancado_por_funcionario_nome = f.nome
FROM funcionarios f
WHERE p.lancado_por_funcionario_id = f.id
  AND (p.lancado_por_funcionario_nome IS NULL OR p.lancado_por_funcionario_nome = '');
