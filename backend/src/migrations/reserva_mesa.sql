-- Reserva de mesa: recurso opcional por loja (fica desligado ate o
-- lojista ativar na aba Configuracoes do painel).
ALTER TABLE estabelecimentos ADD COLUMN IF NOT EXISTS reserva_mesa_ativa BOOLEAN DEFAULT false;

CREATE TABLE IF NOT EXISTS reservas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  estabelecimento_id UUID NOT NULL REFERENCES estabelecimentos(id) ON DELETE CASCADE,
  cliente_nome VARCHAR(150) NOT NULL,
  cliente_telefone VARCHAR(20) NOT NULL,
  data_reserva DATE NOT NULL,
  horario_reserva VARCHAR(5) NOT NULL,
  quantidade_pessoas INT NOT NULL,
  observacoes TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pendente',
  criado_em TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reservas_estabelecimento ON reservas(estabelecimento_id);
