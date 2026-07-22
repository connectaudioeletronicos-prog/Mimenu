# Backlog Palatos — funcionalidades planejadas

> Este arquivo serve como "gancho": tudo que foi pedido mas ainda não foi
> implementado fica registrado aqui, organizado por área, pra não se perder
> ao longo das conversas. Marque com `[x]` conforme for implementado.

## Bugs conhecidos (reportados 22/07)
- [x] Lista de pedidos (cliente e/ou dashboard do lojista) mostra só a data,
      falta o horário — corrigido em `frontend/js/cardapio.js`
      (`renderizarPedidosCliente` agora usa `toLocaleString` com data+hora)
- [x] Dashboard do administrador não mostra o código/ID do pedido —
      adicionado `Pedido #xxxxxxxx` em `renderizarPedidosAdmin`
      (`frontend/admin/js/admin.js`) e na lista "Meus pedidos" do cliente
      (`frontend/js/cardapio.js`)
- [x] Tela "Minha conta" (Meus dados / Meus pedidos) do cliente sem visual —
      causa raiz: o HTML usava as classes `.tela-cliente*`, mas o CSS só
      tinha regras para `.menu-cliente*` (nomes nunca bateram, por isso
      nunca teve estilo nenhum). Adicionado bloco `.tela-cliente*` completo
      em `frontend/css/componentes.css`

## Cadastro / infraestrutura
- [x] Confirmar execução da `migration_dados_legais.sql` no Supabase —
      migration original havia sido perdida; reconstruída em 22/07/2026 a
      partir do `INSERT INTO dados_legais` já existente em
      `backend/src/controllers/authController.js` (função `cadastrar`) e do
      `LEFT JOIN` em `comunicacaoController.js`. Executada no SQL Editor do
      Supabase e confirmada via `information_schema.columns` (23 colunas,
      1:1 com `estabelecimentos`, aceita CPF **ou** CNPJ+razão social)
- [x] URLs públicas mais limpas para o cardápio da loja
      (ex: `palatos.com.br/loja-teste`) — mecanismo já existia de ponta a
      ponta (`404.html` + `config.js` + geração de link no `authController`),
      faltava proteção contra colisão de slug. Adicionado em 22/07/2026:
      - `validarSlug` + `SLUGS_RESERVADOS` em `backend/src/utils/validadores.js`
      - checagem de formato e de reservados em `authController.js` (cadastrar)
      - erro 409 amigável quando o slug já está em uso (antes caía em erro 500 genérico)
      - checagem espelhada client-side em `cadastro.html` (Etapa 1), pra
        avisar antes do lojista preencher a Etapa 2 inteira
- [ ] Redesign do dashboard do lojista: page-builder arrastável com blocos
      reordenáveis (carrossel, vitrine, widget de texto livre)

## Login e marca
- [ ] Repensar a cor/texto da tagline "MAIS SABOR. MAIS PEDIDOS." — "pedidos"
      fala mais com o lojista do que com o cliente final. Opções sugeridas:
      "Mais sabor. Mais praticidade.", "Peça fácil. Coma bem."
- [ ] Confirmar cor exata de cada palavra da tagline (verde/laranja)

## Cardápio do cliente (frontend/index.html)
- [ ] Imagens dos carrosséis e da vitrine devem linkar direto pro produto
- [ ] Pedido para retirar no local (pickup), com tempo estimado de preparo
      exibido pro cliente (igual ao delivery)
- [ ] Pedido agendado (data/hora futura), com pagamento no momento da
      finalização do pedido (não no agendamento)
- [ ] Reserva de mesa (só para lojas com atendimento local): cliente solicita,
      cai no dashboard da loja, admin confirma mesa/quantidade/horário
- [ ] Notificação pro cliente quando a cozinha marcar o pedido como pronto
      (delivery)
- [ ] Rastreamento por GPS do entregador dentro do app do cliente
- [ ] Opção de gorjeta no fechamento do pedido

## Promoções
- [ ] Duração opcional (data/hora início → data/hora fim). Ao expirar, a
      promoção não é excluída — vai para uma aba "Desabilitado" no dashboard,
      podendo ser reativada no futuro

## Dashboard do lojista
- [ ] Páginas separadas para atendimento "Mesa" e "Delivery", permitindo
      marcar pedidos por tipo
- [ ] Cupons de desconto:
  - Código único por cupom, com validade definida pelo lojista
  - Regra configurável: por quantidade ("compre 2 leve 1 sobremesa") ou por
    valor mínimo ("acima de R$X, ganhe Y% de desconto")
  - Aplica-se à próxima compra do cliente, tanto mesa quanto delivery
- [ ] Histórico de vendas:
  - Filtro por período (dia, hora específica, intervalo de datas)
  - Lista: ID do pedido, valor, tipo (mesa/delivery), atendente responsável
  - Gráfico de 3 cores (vermelho = período fraco, laranja = médio,
    verde = melhor período), comparando volume e valor entre períodos
    (semana, mês, trimestre, semestre, ano, e ano a ano depois disso)
  - Retenção: manter histórico por tempo indeterminado enquanto a loja
    estiver ativa; se a loja fechar, manter por até 2 meses

## Apps auxiliares (via QR Code, sem app nativo por enquanto)
- [ ] **App do funcionário (comanda):** QR Code único gerado por funcionário
      no cadastro, com permissões por categoria. Emite QR de cobrança pra
      comanda, vinculado ao caixa. Mostra produtos/categorias/promoções com
      controle de quantidade. Cancelamento de pedido exige senha do gerente
  - Observação (22/07): "atendente" é só o nome provisório — na prática é
    qualquer funcionário de mesa/balcão, definido pelo cadastro de
    funcionários e pelas caixinhas de autorização já existentes.
  - Cada app auxiliar (funcionário, cozinha, entregador) só se comunica
    com o dashboard/admin da loja — nunca entre si.
  - Exceção: o app de mesa/balcão é o único que tem acesso ao código do
    cliente (lido via QR/código de barras na mesa) e é o responsável
    exclusivo por aquele atendimento — evita que o cliente faça pedidos
    através de mais de uma pessoa e complique a comanda depois.
  - Esse funcionário pode fazer pedidos e cobrança, mas **não pode
    cancelar** um pedido já gerado — qualquer problema precisa passar
    pelo gerente.
- [ ] **App da cozinha:** QR Code gerado pelo admin. Só visualização de
      produtos e descrição (sem valor). Recebe pedidos do admin, marca como
      "pronto" quando finalizado
- [ ] **App do entregador:**
  - Recebe pedido pronto do admin (ou retira e confirma manualmente)
  - Marca "entregue" ao finalizar
  - Contador de entregas realizadas
  - Bloqueio de 30 min se exceder o tempo estimado sem finalizar
  - Se não encontrar o cliente: retorna pra loja e só pode tentar de novo
    após contato/liberação da loja
  - Cada entrega soma o valor de comissão definido pelo admin
  - Vinculado ao GPS + app do administrador
  - Regra geral: cada uma dessas extensões (funcionário, cozinha,
    entregador) só se comunica com o admin — nunca entre si diretamente

---
*Última atualização: 22/07/2026 (migration dados_legais confirmada; validação de slug/URL limpa concluída)*
