-- ===================================================================
-- SCHEMA DO BANCO DE DADOS - CARDAPIO DIGITAL MULTI-TENANT
-- PostgreSQL (Supabase)
-- ===================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE estabelecimentos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug VARCHAR(100) UNIQUE NOT NULL,
    nome VARCHAR(150) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    senha_hash VARCHAR(255) NOT NULL,
    logo_url TEXT,
    banner_url TEXT,
    cor_principal VARCHAR(7) DEFAULT '#E63946',
    cor_secundaria VARCHAR(7) DEFAULT '#1D3557',
    cor_botoes VARCHAR(7) DEFAULT '#2A9D8F',
    fonte VARCHAR(50) DEFAULT 'Poppins',
    tema VARCHAR(30) DEFAULT 'classico',
    texto_apresentacao TEXT,
    whatsapp VARCHAR(20),
    telefone VARCHAR(20),
    endereco TEXT,
    instagram VARCHAR(150),
    facebook VARCHAR(150),
    linkedin VARCHAR(255),
    email_contato VARCHAR(150),
    termos_uso TEXT,
    politica_privacidade TEXT,
    cookies TEXT,
    horario_funcionamento JSONB DEFAULT '{}',
    dominio_proprio VARCHAR(150) UNIQUE,
    mp_access_token TEXT,
    mp_public_key TEXT,
    ativo BOOLEAN DEFAULT true,
    plano VARCHAR(30) DEFAULT 'gratuito',
    criado_em TIMESTAMP DEFAULT NOW(),
    atualizado_em TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_estabelecimentos_slug ON estabelecimentos(slug);
CREATE INDEX idx_estabelecimentos_dominio ON estabelecimentos(dominio_proprio);

CREATE TABLE categorias (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    estabelecimento_id UUID NOT NULL REFERENCES estabelecimentos(id) ON DELETE CASCADE,
    nome VARCHAR(100) NOT NULL,
    icone_url TEXT,
    ordem INTEGER DEFAULT 0,
    ativo BOOLEAN DEFAULT true,
    criado_em TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_categorias_estabelecimento ON categorias(estabelecimento_id);

CREATE TABLE produtos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    estabelecimento_id UUID NOT NULL REFERENCES estabelecimentos(id) ON DELETE CASCADE,
    categoria_id UUID REFERENCES categorias(id) ON DELETE SET NULL,
    codigo VARCHAR(50),
    nome VARCHAR(150) NOT NULL,
    descricao TEXT,
    preco NUMERIC(10,2) NOT NULL,
    preco_promocional NUMERIC(10,2),
    foto_url TEXT,
    disponivel BOOLEAN DEFAULT true,
    ordem INTEGER DEFAULT 0,
    criado_em TIMESTAMP DEFAULT NOW(),
    atualizado_em TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_produtos_estabelecimento ON produtos(estabelecimento_id);
CREATE INDEX idx_produtos_categoria ON produtos(categoria_id);

CREATE TABLE promocoes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    estabelecimento_id UUID NOT NULL REFERENCES estabelecimentos(id) ON DELETE CASCADE,
    titulo VARCHAR(150) NOT NULL,
    descricao TEXT,
    imagem_url TEXT,
    produto_id UUID REFERENCES produtos(id) ON DELETE SET NULL,
    ativo BOOLEAN DEFAULT true,
    data_inicio TIMESTAMP,
    data_fim TIMESTAMP,
    criado_em TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_promocoes_estabelecimento ON promocoes(estabelecimento_id);

CREATE TABLE pedidos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    estabelecimento_id UUID NOT NULL REFERENCES estabelecimentos(id) ON DELETE CASCADE,
    cliente_nome VARCHAR(150) NOT NULL,
    cliente_telefone VARCHAR(20) NOT NULL,
    cliente_endereco TEXT,
    itens JSONB NOT NULL,
    subtotal NUMERIC(10,2) NOT NULL,
    taxa_entrega NUMERIC(10,2) DEFAULT 0,
    gorjeta NUMERIC(10,2) DEFAULT 0,
    total NUMERIC(10,2) NOT NULL,
    forma_pagamento VARCHAR(30) NOT NULL,
    status_pagamento VARCHAR(30) DEFAULT 'pendente',
    mp_payment_id VARCHAR(100),
    -- Fluxo: novo -> preparando (admin aceita, vai pra cozinha) -> pronto
    -- (cozinha finalizou) -> saiu_entrega (admin confirma, sistema atribui
    -- automaticamente ao proximo entregador da fila) -> entregue.
    status_pedido VARCHAR(30) DEFAULT 'novo',
    -- Hoje so existe pedido por entrega. Essa coluna ja deixa o caminho
    -- pronto para quando o pedido de balcao for criado (Caixa Geral).
    tipo_pedido VARCHAR(20) DEFAULT 'entrega',
    observacoes TEXT,
    entregador_id UUID,
    entregador_nome VARCHAR(150),
    horario_pronto TIMESTAMP,
    horario_saiu_entrega TIMESTAMP,
    criado_em TIMESTAMP DEFAULT NOW(),
    atualizado_em TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_pedidos_estabelecimento ON pedidos(estabelecimento_id);
CREATE INDEX idx_pedidos_status ON pedidos(status_pedido);
CREATE INDEX idx_pedidos_mp_payment ON pedidos(mp_payment_id);
CREATE INDEX idx_pedidos_tipo ON pedidos(tipo_pedido);

-- ===================================================================
-- Clientes (cadastro automatico ao fazer pedido + tela "Meus dados")
-- ===================================================================
CREATE TABLE clientes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    estabelecimento_id UUID NOT NULL REFERENCES estabelecimentos(id) ON DELETE CASCADE,
    nome VARCHAR(150) NOT NULL,
    telefone VARCHAR(20) NOT NULL,
    endereco TEXT,
    cep VARCHAR(9),
    email VARCHAR(150),
    criado_em TIMESTAMP DEFAULT NOW(),
    atualizado_em TIMESTAMP DEFAULT NOW(),
    UNIQUE (estabelecimento_id, telefone)
);

CREATE INDEX idx_clientes_estabelecimento ON clientes(estabelecimento_id);

-- ===================================================================
-- Funcionarios (login proprio, cargo, permissoes)
-- ===================================================================
CREATE TABLE funcionarios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    estabelecimento_id UUID NOT NULL REFERENCES estabelecimentos(id) ON DELETE CASCADE,
    nome VARCHAR(150) NOT NULL,
    email VARCHAR(150) NOT NULL,
    username VARCHAR(100),
    senha_hash VARCHAR(255) NOT NULL,
    -- cargos: administrador, gerente, caixa, garcom, colaborador, cozinha, entregador
    cargo VARCHAR(30) NOT NULL,
    permissoes JSONB DEFAULT '[]',
    ativo BOOLEAN DEFAULT true,
    ordem INT DEFAULT 0,
    -- Usadas so por cargo = 'entregador': controla a fila de atribuicao
    -- automatica de pedidos (sempre por ordem de chegada) e o contador de
    -- entregas realizadas.
    disponivel_entrega BOOLEAN DEFAULT true,
    ultima_fila_em TIMESTAMP DEFAULT NOW(),
    total_entregas INT DEFAULT 0,
    criado_em TIMESTAMP DEFAULT NOW(),
    atualizado_em TIMESTAMP DEFAULT NOW(),
    UNIQUE (estabelecimento_id, email),
    UNIQUE (estabelecimento_id, username)
);

CREATE INDEX idx_funcionarios_estabelecimento ON funcionarios(estabelecimento_id);

-- So agora a tabela funcionarios existe, entao o vinculo do entregador
-- atribuido automaticamente ao pedido pode ser criado.
ALTER TABLE pedidos ADD CONSTRAINT pedidos_entregador_id_fkey
  FOREIGN KEY (entregador_id) REFERENCES funcionarios(id) ON DELETE SET NULL;

-- ===================================================================
-- Auditoria (trilha de quem fez o que)
-- ===================================================================
CREATE TABLE auditoria (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    estabelecimento_id UUID NOT NULL REFERENCES estabelecimentos(id) ON DELETE CASCADE,
    funcionario_id UUID,
    funcionario_nome VARCHAR(150),
    acao VARCHAR(100) NOT NULL,
    tabela_afetada VARCHAR(100),
    registro_id UUID,
    dados_anteriores JSONB,
    dados_novos JSONB,
    ip VARCHAR(60),
    criado_em TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_auditoria_estabelecimento ON auditoria(estabelecimento_id);

-- ===================================================================
-- Carrosseis extras (banners adicionais, fotos ilimitadas, posicionaveis)
-- ===================================================================
CREATE TABLE carrosseis (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    estabelecimento_id UUID NOT NULL REFERENCES estabelecimentos(id) ON DELETE CASCADE,
    nome VARCHAR(100) DEFAULT 'Carrossel',
    posicao VARCHAR(30) NOT NULL DEFAULT 'apos-cabecalho',
    ordem INT DEFAULT 0,
    ativo BOOLEAN DEFAULT false,
    criado_em TIMESTAMP DEFAULT NOW(),
    atualizado_em TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_carrosseis_estabelecimento ON carrosseis(estabelecimento_id);

CREATE TABLE carrossel_imagens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    carrossel_id UUID NOT NULL REFERENCES carrosseis(id) ON DELETE CASCADE,
    imagem_url TEXT NOT NULL,
    ordem INT DEFAULT 0,
    criado_em TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_carrossel_imagens_carrossel ON carrossel_imagens(carrossel_id);

-- ===================================================================
-- Vitrines (imagem grande + caixa de texto, posicionavel)
-- ===================================================================
CREATE TABLE vitrines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    estabelecimento_id UUID NOT NULL REFERENCES estabelecimentos(id) ON DELETE CASCADE,
    imagem_url TEXT NOT NULL,
    texto VARCHAR(300),
    posicao VARCHAR(30) NOT NULL DEFAULT 'apos-produtos',
    ordem INT DEFAULT 0,
    ativo BOOLEAN DEFAULT false,
    criado_em TIMESTAMP DEFAULT NOW(),
    atualizado_em TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_vitrines_estabelecimento ON vitrines(estabelecimento_id);

CREATE OR REPLACE FUNCTION atualizar_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.atualizado_em = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_estabelecimentos_update
    BEFORE UPDATE ON estabelecimentos
    FOR EACH ROW EXECUTE FUNCTION atualizar_timestamp();

CREATE TRIGGER trg_produtos_update
    BEFORE UPDATE ON produtos
    FOR EACH ROW EXECUTE FUNCTION atualizar_timestamp();

CREATE TRIGGER trg_pedidos_update
    BEFORE UPDATE ON pedidos
    FOR EACH ROW EXECUTE FUNCTION atualizar_timestamp();

INSERT INTO estabelecimentos (
    slug, nome, email, senha_hash,
    cor_principal, cor_secundaria, cor_botoes, fonte, tema,
    texto_apresentacao, whatsapp, telefone, endereco, instagram,
    horario_funcionamento
) VALUES (
    'fj-pizzaria',
    'FJ Pizzaria e Esfiharia',
    'contato@fjpizzaria.com.br',
    '$2b$10$EpRnTzVlqHNP6E0jJa.cZ.0z40Lcz9N3w2qiqcjEYZ7G5kxXTAaUe',
    '#E63946', '#1D3557', '#F77F00', 'Poppins', 'classico',
    'As melhores pizzas e esfihas da regiao, feitas com ingredientes frescos e muito carinho!',
    '5511999999999', '1133334444',
    'Rua das Pizzas, 123 - Sao Paulo, SP',
    '@fjpizzaria',
    '{"seg": "18:00-23:00", "ter": "18:00-23:00", "qua": "18:00-23:00", "qui": "18:00-23:00", "sex": "18:00-00:00", "sab": "18:00-00:00", "dom": "fechado"}'
);

INSERT INTO categorias (estabelecimento_id, nome, ordem)
SELECT id, 'Pizzas', 1 FROM estabelecimentos WHERE slug = 'fj-pizzaria';
INSERT INTO categorias (estabelecimento_id, nome, ordem)
SELECT id, 'Esfihas', 2 FROM estabelecimentos WHERE slug = 'fj-pizzaria';
INSERT INTO categorias (estabelecimento_id, nome, ordem)
SELECT id, 'Bebidas', 3 FROM estabelecimentos WHERE slug = 'fj-pizzaria';

INSERT INTO produtos (estabelecimento_id, categoria_id, nome, descricao, preco, codigo)
SELECT e.id, c.id, 'Pizza Margherita', 'Molho de tomate, mussarela, manjericao fresco e azeite', 45.90, 'PZ001'
FROM estabelecimentos e JOIN categorias c ON c.estabelecimento_id = e.id AND c.nome = 'Pizzas'
WHERE e.slug = 'fj-pizzaria';

INSERT INTO produtos (estabelecimento_id, categoria_id, nome, descricao, preco, codigo)
SELECT e.id, c.id, 'Esfiha de Carne', 'Esfiha aberta de carne moida temperada', 6.50, 'ES001'
FROM estabelecimentos e JOIN categorias c ON c.estabelecimento_id = e.id AND c.nome = 'Esfihas'
WHERE e.slug = 'fj-pizzaria';

INSERT INTO produtos (estabelecimento_id, categoria_id, nome, descricao, preco, codigo)
SELECT e.id, c.id, 'Coca-Cola 2L', 'Refrigerante Coca-Cola garrafa 2 litros', 12.00, 'BEB001'
FROM estabelecimentos e JOIN categorias c ON c.estabelecimento_id = e.id AND c.nome = 'Bebidas'
WHERE e.slug = 'fj-pizzaria';
