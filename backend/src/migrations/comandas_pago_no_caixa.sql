-- Marca quando uma comanda foi paga no Caixa (cargo 'caixa') em vez de
-- pelo proprio garcom dono da mesa -- ex: cliente com pressa que o garcom
-- responsavel esta ocupado, e vai direto pagar no caixa da loja.
-- O "dono" da comanda (funcionario_id / funcionario_nome) NUNCA muda
-- nesse caso -- continua sendo do garcom que abriu e atendeu a mesa do
-- inicio ao fim; so fica registrado ONDE o pagamento foi processado.
ALTER TABLE comandas ADD COLUMN IF NOT EXISTS pago_no_caixa BOOLEAN NOT NULL DEFAULT false;
