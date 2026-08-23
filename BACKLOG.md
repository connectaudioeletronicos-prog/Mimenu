# Backlog Palatos — funcionalidades planejadas

> Este arquivo serve como "gancho": tudo que foi pedido mas ainda não foi
> implementado fica registrado aqui, organizado por área, pra não se perder
> ao longo das conversas. Marque com `[x]` conforme for implementado.

## ⚠️ Sobre a pasta `backend/src/migrations/`
- **O que é:** cada arquivo `.sql` ali é um passo de alteração do banco
  (criar tabela, adicionar coluna, mover pra outro schema, etc.). O backend
  roda **todos automaticamente sozinho**, na ordem alfabética do nome do
  arquivo, toda vez que o servidor sobe — não precisa rodar nada manual.
  Ele guarda quais já rodaram numa tabela `schema_migrations`, então cada
  arquivo só é executado **uma vez**, mesmo reiniciando o servidor várias
  vezes.
- **Por que o nome do arquivo importa:** como a ordem é alfabética, quando
  uma migration depende de outra ter rodado antes (ex: mover uma tabela de
  schema só pode acontecer depois dela existir), o nome do arquivo é
  prefixado (`zz_...`, `zzz_...`) só pra forçar ele a rodar por último.
- **REGRA DE OURO (aprendida com dor, 07/08):** se um arquivo dessa pasta
  não está no repositório que está de fato no ar (Render), a coluna/tabela
  que ele criaria **simplesmente não existe** no banco — e qualquer rota
  que precise dela quebra com erro genérico ("Erro ao fazer checkin",
  "Erro ao obter histórico de plantões", etc.), sem avisar claramente que
  o motivo é "faltou subir uma migration". Isso já causou pelo menos 2 bugs
  de produção difíceis de rastrear (schema `entregador` e coluna
  `total_gorjetas` ausentes). **Sempre que um arquivo novo dessa pasta for
  entregue, ele precisa ser adicionado ao repositório de verdade — nunca
  só copiado/testado localmente.**
- **Migrations específicas do app do entregador** (todas em
  `backend/src/migrations/`), pra checagem rápida de que estão todas lá:
  - `plantoes_entregador.sql` — cria a tabela de turnos/plantões
  - `plantoes_entregador_gorjetas.sql` — adiciona a coluna `total_gorjetas`
  - `pedidos_entregador_horarios.sql` — horários de saída/entrega do pedido
  - `pedidos_troco.sql` — coluna `troco_para` (pagamento em dinheiro)
  - `zz_entregador_schema_dedicado.sql` — move `plantoes_entregador` pro
    schema próprio `entregador` (banco "separado" do app do entregador)
  - `zzz_plantoes_total_gorjetas_fix.sql` — reforça a coluna `total_gorjetas`
    já qualificada no schema novo (correção depois do bug de 07/08)
- **Sobre editar isso pelo celular/GitHub:** se aparecer "You need to fork
  this repository to propose changes", a conta logada no GitHub não tem
  permissão de escrita nesse repositório — precisa logar com a conta dona
  ou pedir pra ser adicionado como colaborador (não é um problema de
  código, é permissão de acesso).

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
- [x] Arrastar/reordenar funcionário na aba Equipe/Cadastro não funcionava —
      causa raiz: a lista de funcionários usava uma implementação própria
      via `pointerdown`/`pointermove` (diferente e não testada), enquanto
      categorias/produtos/promoções usam drag-and-drop HTML5 nativo
      (`draggable` + `dragstart`/`dragover`/`drop`). Trocado para o mesmo
      padrão nativo já comprovado — 22/07

## Cadastro / infraestrutura
- [x] Leitor de codigo de barras fisico (USB ou Bluetooth) no cadastro de
      produtos — esses leitores operam em "modo teclado" (nao precisam de
      driver/conexao especial): o campo `produto-codigo` agora escuta o
      Enter que o leitor manda e dispara a mesma busca que ja existia pro
      leitor por camera (`frontend/admin/js/admin.js`)
- [x] API que preenche nome/preco sugerido/embalagem ao ler o codigo de
      barras — conectado com o Cosmos (Bluesoft), plano gratuito (25
      consultas/dia). Token fica SO no backend (`COSMOS_API_TOKEN` no
      `.env`, nunca no frontend/GitHub Pages) — nova rota
      `GET /admin/produtos/consulta-codigo-barras/:codigo`
      (`produtoController.js`), chamada pelo admin via `apiConsultarCodigoBarras`
      (`admin-api.js`). Preco preenchido e' so' sugestao (media de mercado),
      lojista revisa antes de salvar
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
- [x] Redesign do dashboard do lojista: page-builder arrastável com blocos
      reordenáveis (carrossel, vitrine, widget de texto livre) — implementado
      em 22/07/2026 como nova aba "🧩 Construtor de página". Descoberto que
      carrossel, vitrine E caixa de texto (texto livre) já existiam prontos
      no backend/banco usando o mesmo sistema de `posicao`/`ordem`
      (incluindo `apos-categoria:<id>` para intercalar com categorias
      específicas) — não precisou de tabela nova nem endpoint novo.
      A nova aba só junta os 3 tipos numa lista única arrastável
      (SortableJS, com suporte a touch/mobile) que resolve automaticamente
      qual `posicao`/`ordem` salvar em cada bloco ao arrastar, reaproveitando
      os endpoints PUT já existentes (`/admin/carrosseis/:id`,
      `/admin/vitrines/:id`, `/admin/caixas-texto/:id`).
      Arquivos: `frontend/admin/index.html`, `frontend/admin/js/admin.js`,
      `frontend/admin/js/admin-construtor.js` (novo), `frontend/admin/css/admin.css`

## Login e marca
- [ ] Repensar a cor/texto da tagline "MAIS SABOR. MAIS PEDIDOS." — "pedidos"
      fala mais com o lojista do que com o cliente final. Opções sugeridas:
      "Mais sabor. Mais praticidade.", "Peça fácil. Coma bem."
- [ ] Confirmar cor exata de cada palavra da tagline (verde/laranja)

## Cardápio do cliente (frontend/index.html)
- [ ] Imagens dos carrosséis e da vitrine devem linkar direto pro produto
- [ ] Pedido para retirar no local (pickup), com tempo estimado de preparo
      exibido pro cliente (igual ao delivery)
- [ ] Pedido agendado (data/hora futura) — EM ANDAMENTO 24/07: recurso
      opcional (toggle em Configurações, some do app do cliente se
      desligado). Regras definidas: agenda até 24h à frente; intervalo de
      horários disponíveis configurável pelo lojista no dashboard; só
      confirma após pagamento online (sem opção de pagar na entrega pra
      esses pedidos). Já criado no banco: `estabelecimentos.pedido_agendado_ativo`
      e `pedidos.agendado_para`. Falta: tela de agendamento no cliente
      (calendário/horário), campo de intervalo no admin, bloqueio de
      "pagar na entrega" quando for agendado
- [x] Distinguir reserva recusada pela loja ("Recusada") de reserva
      cancelada pelo proprio cliente ("Cancelado pelo cliente") — coluna
      nova `cancelada_por` ('loja'/'cliente') em `reservas`
      (`backend/src/migrations/reservas_cancelada_por.sql`), preenchida em
      `reservaController.js` (`atualizarStatus` grava 'loja',
      `cancelarPropria` grava 'cliente'). Rotulo dinamico em
      `frontend/js/minhas-reservas.js` (cliente) e
      `frontend/admin/js/admin.js` (painel do lojista)
- [x] Reserva de mesa (só para lojas com atendimento local) — 24/07:
      recurso opcional (toggle em Configurações). Cliente vê um menu
      discreto "Reserva" no cardápio (só se ativado), preenche nome,
      telefone, dia, hora e quantidade de pessoas. Cai numa aba "Reservas"
      no dashboard, admin confirma ou cancela.
- [x] Notificação pro cliente quando a cozinha marcar o pedido como pronto
      (delivery) — status "pronto" entra na timeline do acompanhamento do
      cliente + notificação do navegador (best-effort) em 22/07
- [ ] Rastreamento por GPS do entregador dentro do app do cliente
- [x] Opção de gorjeta no fechamento do pedido

## Promoções
- [ ] Duração opcional (data/hora início → data/hora fim). Ao expirar, a
      promoção não é excluída — vai para uma aba "Desabilitado" no dashboard,
      podendo ser reativada no futuro

## Dashboard do lojista
- [ ] **Reorganização do menu lateral (planejada, aguardando implementação) — 24/07**
      Ordem definida pelo dono do produto, pra aplicar quando formos mexer
      no menu de novo (juntar Configuração como um grupo/submenu):
      1. Pedidos
      2. Atendimento
      3. Categorias
      4. Produtos
      5. Promoções
      6. Carrosséis e Vitrines
      7. Construtor de página
      8. Divulgação (QR Code / Link)
      9. Funcionários
      10. **Configuração** (grupo/submenu com):
          - Aparência
          - Informações
          - Agendamento de pedidos
          - Reserva de mesa
          - Páginas legais
          - Caixa
          - Pagamento
          - Senha
- [x] Aba "Funcionarios" virou aba "Equipe" (visão operacional por função:
      Cozinha / Entregadores / Atendimento) + botão "⚙️ Cadastro de
      funcionarios" no canto superior direito, abrindo o cadastro completo
      como subpágina fixa (não modal/flutuante) — 22/07
- [x] Cargos "Cozinha" e "Entregador" adicionados ao cadastro de
      funcionários — 22/07
- [x] Fluxo completo de status do pedido: novo → preparando (admin aceita,
      informa o cliente) → pronto (cozinha marca, soa bip no dashboard e
      avisa o cliente) → saiu_entrega (admin confirma, sistema atribui
      automaticamente ao próximo entregador da fila) → entregue. Cada etapa
      só avança pra próxima (sem pular ou voltar) — 22/07
- [x] Fila de entregadores por ordem de chegada (regra absoluta): atribuição
      automática sempre pro entregador disponível há mais tempo esperando;
      ao concluir uma entrega ele volta pro fim da fila. Toggle de
      disponibilidade na aba Equipe — 22/07
- [x] Campainha ao receber pedido novo e bipe ao cozinha marcar pronto, no
      dashboard do administrador (Web Audio, sem depender de arquivo de
      áudio) — 22/07
- [x] Carga horária (opcional) no cadastro de funcionário: dias da semana +
      horário de entrada/saída — 22/07
- [x] "+ Novo pedido" na aba Pedidos: qualquer funcionário com a permissão
      "Criar pedidos" (ex: garçom) já lança um pedido de balcão/mesa
      escolhendo produtos do cardápio — entra direto como "preparando"
      (pula o aceite do admin, já que quem lançou já "aceitou" na hora) — 22/07
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
- [x] **App do garçom (`frontend/atendente/`):** app próprio, separado do
      dashboard — 04/08: login exclusivo pra cargo "garçom" (slug + usuário
      + senha), cardápio com categorias/busca, comanda por mesa/cliente
      (dá pra salvar várias comandas abertas ao mesmo tempo e trocar entre
      elas), finalizar envia pro backend com `canal_venda: 'mesa'` (não se
      mistura com o Atendimento balcão do dashboard, mas ambos caem no
      mesmo Caixa/relatórios). Pagamento: Dinheiro/Cartão Crédito/Cartão
      Débito/PIX (Pix ainda sem QR real — ver pendência de Mercado Pago
      abaixo). Botão "⚠️ Problema no pagamento" no menu lateral pede senha
      de gerente/administrador (`POST /funcionarios/verificar-senha-supervisor`)
      sem trocar a sessão do garçom. Ainda faltam:
  - **Link/QR de acesso direto pelo admin:** hoje só loga pelo formulário
    manual (`https://palatos.com.br/frontend/atendente/index.html`, slug +
    usuário + senha) ou por link `?acesso=token` se o token for pego direto
    no banco. Falta replicar em `frontend/admin/js/admin.js` o mesmo botão
    "Link de acesso" que a aba Equipe já mostra pro entregador, apontando
    pra esse app
  - Tela "Resumo do Atendente" no dashboard (design de referência já
    recebido) — resumo de vendas/fechamento de caixa por garçom, filtrando
    só `canal_venda = 'mesa'`, protegida por senha de admin/gerente
  - QR de cobrança Pix de verdade (ver Mercado Pago, abaixo)
- [x]/[ ] **App da cozinha:** por enquanto funciona *dentro do próprio
      dashboard* — funcionário com cargo "Cozinha" só vê pedidos em preparo,
      sem valores, com botão único "Marcar como pronto" (22/07). Ainda falta:
      QR Code de acesso dedicado gerado pelo admin (sem precisar de
      login completo)
- [x]/[x] **App do entregador:** app próprio e separado do dashboard
      administrativo — 23-24/07: login (slug + usuário + senha), checkin
      diário por QR Code (com fallback de código manual pra câmera
      quebrada), fila por ordem de chegada com oferta/aceite/recusa (não
      atribuição automática direta), botão "Encerrar entrega". Também
      ganhou: link de acesso definitivo por funcionário (facilita login,
      não substitui senha) e liberação pontual de hora extra (ignora a
      carga horária configurada só no dia liberado). Ainda faltam:
  - Bloqueio de 30 min se exceder o tempo estimado sem finalizar
  - Se não encontrar o cliente: retorna pra loja e só pode tentar de novo
    após contato/liberação da loja
  - Cada entrega soma o valor de comissão definido pelo admin
  - Vinculado ao GPS + app do administrador
  - Regra geral: cada uma dessas extensões (funcionário, cozinha,
    entregador) só se comunica com o admin — nunca entre si diretamente

## Pagamento (Mercado Pago / Pix)
- [ ] **Integração real de Pix via Mercado Pago — 04/08:** hoje só existe o
      campo pra guardar `mp_access_token`/`mp_public_key` nas configurações;
      a função que geraria a cobrança Pix + QR Code de verdade
      (`webhookMercadoPago` em `pedidoController.js`) ainda é só um stub
      vazio (`res.sendStatus(200)`, não confirma nada). Falta: chamar a API
      do Mercado Pago pra gerar a cobrança + QR ao finalizar um pedido Pix
      (cliente ou app do garçom), e processar o webhook de confirmação de
      verdade, atualizando `status_pagamento`

---
*Última atualização: 04/08/2026 (app do garçom criado como aplicativo
próprio, separado do dashboard; migration de `canal_venda` restaurada;
pendências de link/QR no admin e integração real de Pix registradas acima)*

