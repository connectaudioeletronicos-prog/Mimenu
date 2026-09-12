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
- [x] Central de Entregas — cartao "Entregadores" na Equipe simplificado
      (so identificacao/situacao), clicavel para abrir uma subpagina
      dedicada com QR Code do dia, 4 cards de estatisticas (entregas hoje,
      em andamento, finalizadas hoje, aguardando coleta), lista de
      entregas em andamento e botao "Equipe" que leva pra gestao detalhada
      de cada entregador (disponibilidade/link de acesso/comissao,
      conteudo que antes ficava na Equipe). Fundo da pagina usa a "Cor
      principal" que o lojista escolhe em Personalizacao
      (`ESTADO.estabelecimento.cor_principal`). Botoes "Por KM"/"Valor
      Fixo" filtram a lista de entregadores por forma de pagamento.
      100% com dados que ja existiam (pedidos/equipe operacional), sem
      migration nem rota nova no backend
      (`frontend/admin/admin-index.html`, `frontend/admin/js/admin.js`,
      `frontend/admin/css/admin.css`)
- [x] Removida a funcionalidade de "hora extra"/carga horaria para
      Entregadores — esse cargo nao trabalha por horario fixo, entra e
      sai quando quiser conforme disponibilidade (backend ja isentava
      'entregador' de `exigirDentroDoHorario`, so a interface ainda
      mostrava controles inuteis). Removido: botao "Liberar hora
      extra"/"Hora extra liberada hoje" do card do entregador
      (`admin.js`), tela "Fora do horario de expediente" e toda a
      checagem de `fora_do_horario` do app do entregador
      (`entregador/index.html`, `entregador/entregador.js`), e nota
      adicionada nos campos "Carga horaria" do cadastro/edicao de
      funcionario avisando que nao se aplica a Entregadores. O mecanismo
      de carga horaria/hora extra continua intacto para os outros cargos
      (cozinha, garcom etc.)
- [x] Correção de bug + refatoração da Central de Entregas para seguir à
      risca o layout pedido:
      · Corrigido bug real: um comentário HTML tinha sido cortado numa
      edição anterior e o final dele vazou como texto visível na tela
      ("Conteudo que antes era a aba inteira...")
      · Corrigida a causa do layout "espremido": o container do painel
      tinha `max-width: 800px` fixo, que limitava a Central de Entregas a
      uma coluna estreita — removido especificamente para essa tela
      · Card "Entregadores" na Equipe agora mostra só um resumo (X
      cadastrados, Y disponíveis) em vez de listar cada nome — evita lista
      enorme com 15+ entregadores
      · Menu lateral do painel agora fica escondido na Central de Entregas
      e na Equipe de entregadores, com botão hamburguer (☰) no canto
      superior esquerdo pra abrir/fechar quando precisar
      · Nova janela de detalhe por entregador (clicando nele na lista de
      "Entregas em andamento" ou no botão "💰 Histórico e valores" na
      Equipe de entregadores): histórico de plantões/rotas, valor a
      receber, gorjetas a receber e botão "Marcar tudo como pago". Usa o
      sistema de plantão/comissão que já existia no backend — só faltava
      expor numa tela; adicionada coluna `pago` em
      `plantoes_entregador` (migration nova) e rota
      `PUT /funcionarios/:id/plantao/marcar-pago`
      (`backend/src/migrations/plantoes_entregador_pago.sql`,
      `backend/src/controllers/funcionarioController.js`,
      `backend/src/routes/funcionarios.js`,
      `frontend/admin/js/admin-api.js`,
      `frontend/admin/admin-index.html`, `frontend/admin/js/admin.js`,
      `frontend/admin/css/admin.css`)
- [x] Ajustes finos na Central de Entregas depois de comparar lado a lado
      com o design de referência:
      · Visual reconstruído: cartões escuros translúcidos sobre a cor da
      loja (QR mantém caixa branca própria pra continuar escaneável), 4
      cartões de estatística em uma linha só com ícone circular colorido
      fixo (azul/verde/laranja/vermelho), lista de "Entregas em
      andamento" reformulada pra ser por ENTREGADOR (não por pedido) —
      ponto verde = em rota (mostra pedido/endereço/tempo fora), ponto
      cinza = disponível parado
      · Restaurado o botão de código de checkin manual (existia desde a
      criação do app do entregador — fallback pra quando a câmera do
      entregador não le o QR), que tinha sido removido por engano;
      recolocado abaixo do QR principal na Central de Entregas
      · Removida a tela de "Forma de pagamento da comissão"
      (dropdown+campos+salvar) de dentro de cada card de entregador na
      Equipe — substituída por um painel numérico único ("Por KM"/"Valor
      Fixo" na Central de Entregas) que aplica o valor pra TODOS os
      entregadores cadastrados de uma vez
      · Removido o botão duplicado "QR Code do dia" da tela de Equipe de
      entregadores (o QR único já fica em destaque na Central de
      Entregas)
      · Modal de detalhe do entregador agora busca também o histórico
      real de pedidos entregues (não só plantões), pra sempre mostrar
      dado real mesmo em entregadores que nunca usaram o controle de
      plantão
      · Confirmado (não é bug): "nenhum entregador disponível" acontece
      quando o entregador não fez o check-in do dia (escanear o QR ou
      colar o código) — só ativar o app ou estar com token de acesso não
      basta
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

