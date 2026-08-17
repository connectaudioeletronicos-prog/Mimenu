-- ===================================================================
-- DESTINO: backend/src/migrations/backfill_pago_no_caixa_orfaos.sql (NOVO)
-- ===================================================================
-- Repara comandas com pago_no_caixa = true mas fechada_por_funcionario_id/
-- nome/cargo vazios -- aconteceram nas cobrancas feitas pelo botao
-- "Comanda Garcom" ANTES da correcao do operador_atendimento_id (quando
-- o proprietario usava o gate do Atendimento pra se passar por um Caixa/
-- Gerente/Administrador, mas o backend nao sabia ainda revalidar esse id).
--
-- Generico e seguro pra QUALQUER loja (nao so a loja-teste): so preenche
-- automaticamente quando a loja tem EXATAMENTE 1 funcionario ativo com
-- cargo 'caixa' -- nesse caso, sem ambiguidade nenhuma, so pode ter sido
-- esse. Se a loja tiver 2+ caixas, nao arrisca adivinhar qual foi -- essas
-- ficam de fora do UPDATE, pra revisao manual (rode o SELECT de checagem
-- no final pra ver se sobrou alguma).
-- ===================================================================

UPDATE comandas c
SET fechada_por_funcionario_id = f.id,
    fechada_por_funcionario_nome = f.nome,
    fechada_por_funcionario_cargo = f.cargo
FROM funcionarios f
WHERE c.pago_no_caixa = true
  AND c.fechada_por_funcionario_id IS NULL
  AND f.estabelecimento_id = c.estabelecimento_id
  AND f.cargo = 'caixa'
  AND f.ativo = true
  AND (
    SELECT COUNT(*) FROM funcionarios f2
    WHERE f2.estabelecimento_id = c.estabelecimento_id AND f2.cargo = 'caixa' AND f2.ativo = true
  ) = 1;

-- Checagem: se essa consulta voltar alguma linha, sobrou orfao (loja com
-- 2+ caixas ativos na hora do reparo, ou nenhum caixa cadastrado) --
-- precisa decidir manualmente qual funcionario atribuir.
SELECT c.id, c.estabelecimento_id, c.mesa_cliente, c.numero_comanda, c.fechada_em, c.total
FROM comandas c
WHERE c.pago_no_caixa = true AND c.fechada_por_funcionario_id IS NULL;
