-- Corretiva: garante que as colunas de configuracao de alerta de estoque
-- e a tabela de notificacoes existem. E seguro rodar mesmo se ja existirem
-- (tudo com IF NOT EXISTS) -- serve so pra cobrir o caso da migracao
-- original nao ter sido aplicada em producao.

ALTER TABLE estabelecimentos ADD COLUMN IF NOT EXISTS estoque_alerta_dashboard_ativo BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE estabelecimentos ADD COLUMN IF NOT EXISTS estoque_alerta_email_ativo BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE estabelecimentos ADD COLUMN IF NOT EXISTS estoque_alerta_email_destino TEXT;

CREATE TABLE IF NOT EXISTS estoque_notificacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estabelecimento_id UUID NOT NULL REFERENCES estabelecimentos(id) ON DELETE CASCADE,
  produto_id UUID REFERENCES produtos(id) ON DELETE SET NULL,
  canal TEXT NOT NULL, -- 'dashboard' | 'email'
  mensagem TEXT NOT NULL,
  destino TEXT,
  enviado_com_sucesso BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_estoque_notificacoes_estabelecimento
  ON estoque_notificacoes (estabelecimento_id, criado_em DESC);

-- Liga o alerta de dashboard pra quem ja tinha o modulo de estoque ativo
-- mas nunca passou pela tela "Configurar Alertas" (coluna ficou NULL/false
-- por padrao e o lojista nunca soube que precisava ligar na mao).
UPDATE estabelecimentos
SET estoque_alerta_dashboard_ativo = true
WHERE estoque_modulo_ativo = true AND estoque_alerta_dashboard_ativo IS NOT true;
