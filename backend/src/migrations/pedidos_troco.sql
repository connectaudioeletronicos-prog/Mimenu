-- Pagamento em dinheiro na entrega: valor que o cliente vai pagar em
-- especie, usado pra calcular o troco que o entregador precisa levar.
-- So faz sentido quando forma_pagamento = 'dinheiro'; fica NULL nos demais
-- casos (pix, cartao, pago online) -- ausencia de troco_para = "sem troco".
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS troco_para NUMERIC(10,2);
