-- Sem isso, "valor a receber" nao tem como distinguir plantoes ja pagos
-- dos pendentes -- ficaria somando tudo pra sempre. Default false: todo
-- plantao fechado comeca como "a receber" ate o lojista marcar como pago.
ALTER TABLE plantoes_entregador ADD COLUMN IF NOT EXISTS pago BOOLEAN DEFAULT false;

