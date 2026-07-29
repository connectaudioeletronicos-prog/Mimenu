-- Permite vincular uma imagem do carrossel (ou uma vitrine inteira) a um
-- produto do cardapio: ao tocar na imagem, o cliente ve direto a pagina
-- daquele produto. Fica opcional (null = imagem so ilustrativa).
ALTER TABLE carrossel_imagens ADD COLUMN IF NOT EXISTS produto_id UUID REFERENCES produtos(id) ON DELETE SET NULL;
ALTER TABLE vitrines ADD COLUMN IF NOT EXISTS produto_id UUID REFERENCES produtos(id) ON DELETE SET NULL;
