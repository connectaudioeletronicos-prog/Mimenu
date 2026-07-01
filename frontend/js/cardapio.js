let DADOS = null;
let PRODUTO_SELECIONADO = null;
let QUANTIDADE_MODAL = 1;

const FONTES_GOOGLE = {
  'Poppins': 'Poppins:wght@400;600;700;800',
  'Playfair Display': 'Playfair+Display:wght@500;700;800',
  'Roboto': 'Roboto:wght@400;500;700;900',
  'Montserrat': 'Montserrat:wght@400;600;700;800',
  'Lato': 'Lato:wght@400;700;900'
};

document.addEventListener('DOMContentLoaded', iniciar);

async function iniciar() {
  if (!SLUG_ESTABELECIMENTO) {
    mostrarErro('Endereco de cardapio nao identificado. Verifique o link.');
    return;
  }

  try {
    DADOS = await buscarDadosEstabelecimento(SLUG_ESTABELECIMENTO);
    aplicarIdentidadeVisual(DADOS.estabelecimento);
    montarCabecalho(DADOS.estabelecimento);
    montarPromocoes(DADOS.promocoes, DADOS.produtos);
    montarCategorias(DADOS.categorias);
    montarProdutos(DADOS.categorias, DADOS.produtos);
    montarRodape(DADOS.estabelecimento);
    configurarEventosGlobais();

    document.getElementById('tela-carregando').classList.add('oculto');
    document.getElementById('app').classList.remove('oculto');
  } catch (erro) {
    mostrarErro(erro.message);
  }
}

function mostrarErro(mensagem) {
  document.getElementById('tela-carregando').classList.add('oculto');
  document.getElementById('tela-erro__mensagem').textContent = mensagem;
  document.getElementById('tela-erro').classList.remove('oculto');
}

function aplicarIdentidadeVisual(estabelecimento) {
  document.title = estabelecimento.nome;

  if (estabelecimento.logo_url) {
    document.getElementById('favicon').setAttribute('href', estabelecimento.logo_url);
  }

  const raiz = document.documentElement.style;
  raiz.setProperty('--cor-principal', estabelecimento.cor_secundaria);
  raiz.setProperty('--cor-secundaria', estabelecimento.cor_principal);
  raiz.setProperty('--cor-botoes', estabelecimento.cor_botoes);
  raiz.setProperty('--cor-principal-escura', escurecerCor(estabelecimento.cor_principal, 0.15));
  raiz.setProperty('--cor-botoes-escura', escurecerCor(estabelecimento.cor_botoes, 0.15));

  const fonteEscolhida = estabelecimento.fonte || 'Poppins';
  if (FONTES_GOOGLE[fonteEscolhida]) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${FONTES_GOOGLE[fonteEscolhida]}&display=swap`;
    document.head.appendChild(link);
  }
  raiz.setProperty('--fonte-principal', `'${fonteEscolhida}', sans-serif`);

  const temaValido = ['classico', 'elegante', 'moderno', 'minimalista', 'premium'].includes(estabelecimento.tema)
    ? estabelecimento.tema
    : 'classico';
  document.getElementById('tema-css').setAttribute('href', `css/temas/${temaValido}.css`);
}

function escurecerCor(hex, fator) {
  const cor = hex.replace('#', '');
  const r = Math.max(0, parseInt(cor.substring(0, 2), 16) * (1 - fator));
  const g = Math.max(0, parseInt(cor.substring(2, 4), 16) * (1 - fator));
  const b = Math.max(0, parseInt(cor.substring(4, 6), 16) * (1 - fator));
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

function montarCabecalho(estabelecimento) {
  const banner = document.getElementById('topo-banner');
  if (estabelecimento.banner_url) {
    banner.style.backgroundImage = `url('${escaparAspas(estabelecimento.banner_url)}')`;
  }

  const logo = document.getElementById('logo-estabelecimento');
  logo.src = estabelecimento.logo_url || gerarLogoPlaceholder(estabelecimento.nome);
  logo.alt = estabelecimento.nome;

  document.getElementById('nome-estabelecimento').textContent = estabelecimento.nome;
  document.getElementById('texto-apresentacao').textContent = estabelecimento.texto_apresentacao || '';

  montarStatusFuncionamento(estabelecimento.horario_funcionamento);
}

function gerarLogoPlaceholder(nome) {
  const inicial = (nome || '?').trim().charAt(0).toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
    <rect width="100" height="100" fill="#cccccc"/>
    <text x="50" y="62" font-size="42" text-anchor="middle" fill="#ffffff" font-family="sans-serif">${inicial}</text>
  </svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

const DIAS_SEMANA = { dom: 'Domingo', seg: 'Segunda', ter: 'Terca', qua: 'Quarta', qui: 'Quinta', sex: 'Sexta', sab: 'Sabado' };
const ORDEM_DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];

function montarStatusFuncionamento(horarios) {
  const elemento = document.getElementById('status-funcionamento');
  if (!horarios || Object.keys(horarios).length === 0) {
    elemento.textContent = '';
    return;
  }

  const diaAtual = ORDEM_DIAS[new Date().getDay()];
  const horarioHoje = horarios[diaAtual];

  if (!horarioHoje || horarioHoje.toLowerCase() === 'fechado') {
    elemento.textContent = 'Fechado hoje';
    elemento.className = 'apresentacao__status apresentacao__status--fechado';
    return;
  }

  const [abertura, fechamento] = horarioHoje.split('-');
  const agora = new Date();
  const minutosAgora = agora.getHours() * 60 + agora.getMinutes();
  const minutosAbertura = converterParaMinutos(abertura);
  const minutosFechamento = converterParaMinutos(fechamento);

  const aberto = minutosAgora >= minutosAbertura && minutosAgora <= minutosFechamento;

  elemento.textContent = aberto
    ? `Aberto agora - ate ${fechamento}`
    : `Fechado agora - abre as ${abertura}`;
  elemento.className = `apresentacao__status apresentacao__status--${aberto ? 'aberto' : 'fechado'}`;
}

function converterParaMinutos(horaTexto) {
  const [h, m] = horaTexto.trim().split(':').map(Number);
  return h * 60 + m;
}

function montarPromocoes(promocoes, produtos) {
  const secao = document.getElementById('secao-promocoes');
  const lista = document.getElementById('lista-promocoes');

  if (!promocoes || promocoes.length === 0) {
    secao.classList.add('oculto');
    return;
  }

  lista.innerHTML = promocoes.map(promo => {
    const produtoVinculado = produtos.find(p => p.id === promo.produto_id);
    return `
      <button class="promocao-card" data-promocao-produto="${produtoVinculado ? produtoVinculado.id : ''}">
        ${promo.imagem_url ? `<img src="${escaparAspas(promo.imagem_url)}" alt="${escaparHtml(promo.titulo)}">` : ''}
        <div class="promocao-card__texto">
          <div class="promocao-card__titulo">${escaparHtml(promo.titulo)}</div>
          ${promo.descricao ? `<div class="promocao-card__descricao">${escaparHtml(promo.descricao)}</div>` : ''}
        </div>
      </button>
    `;
  }).join('');

  lista.querySelectorAll('[data-promocao-produto]').forEach(botao => {
    const produtoId = botao.getAttribute('data-promocao-produto');
    if (produtoId) {
      botao.addEventListener('click', () => abrirModalProduto(produtoId));
    }
  });

  secao.classList.remove('oculto');
}

function montarCategorias(categorias) {
  const lista = document.getElementById('lista-categorias');

  lista.innerHTML = categorias.map(cat => `
    <button class="categoria-card" data-categoria-id="${cat.id}">
      <span class="categoria-card__icone">
        ${cat.icone_url ? `<img src="${escaparAspas(cat.icone_url)}" alt="">` : obterEmojiCategoria(cat.nome)}
      </span>
      <span class="categoria-card__nome">${escaparHtml(cat.nome)}</span>
    </button>
  `).join('');

  lista.querySelectorAll('[data-categoria-id]').forEach(botao => {
    botao.addEventListener('click', () => {
      const id = botao.getAttribute('data-categoria-id');
      const destino = document.getElementById(`categoria-secao-${id}`);
      if (destino) destino.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

function obterEmojiCategoria(nome) {
  const nomeLower = nome.toLowerCase();
  if (nomeLower.includes('pizza')) return '🍕';
  if (nomeLower.includes('esfiha') || nomeLower.includes('esfirra')) return '🥙';
  if (nomeLower.includes('bebida') || nomeLower.includes('suco') || nomeLower.includes('refri')) return '🥤';
  if (nomeLower.includes('lanche') || nomeLower.includes('burger') || nomeLower.includes('hamb')) return '🍔';
  if (nomeLower.includes('doce') || nomeLower.includes('sobremesa')) return '🍰';
  if (nomeLower.includes('salada')) return '🥗';
  if (nomeLower.includes('massa') || nomeLower.includes('macarrao')) return '🍝';
  return '🍽️';
}

function montarProdutos(categorias, produtos) {
  const secao = document.getElementById('secao-produtos');

  const html = categorias.map(categoria => {
    const produtosDaCategoria = produtos.filter(p => p.categoria_id === categoria.id);
    if (produtosDaCategoria.length === 0) return '';

    const cardsProdutos = produtosDaCategoria.map(produto => montarCardProduto(produto)).join('');

    return `
      <div class="produtos-grupo" id="categoria-secao-${categoria.id}">
        <h3 class="produtos-grupo__titulo">${escaparHtml(categoria.nome)}</h3>
        ${cardsProdutos}
      </div>
    `;
  }).join('');

  const semCategoria = produtos.filter(p => !p.categoria_id);
  const htmlSemCategoria = semCategoria.length > 0 ? `
    <div class="produtos-grupo">
      <h3 class="produtos-grupo__titulo">Outros</h3>
      ${semCategoria.map(p => montarCardProduto(p)).join('')}
    </div>
  ` : '';

  secao.innerHTML = html + htmlSemCategoria;

  secao.querySelectorAll('[data-produto-id]').forEach(card => {
    card.addEventListener('click', () => abrirModalProduto(card.getAttribute('data-produto-id')));
  });
}

function montarCardProduto(produto) {
  const temPromocao = produto.preco_promocional && parseFloat(produto.preco_promocional) < parseFloat(produto.preco);
  const precoExibido = temPromocao ? produto.preco_promocional : produto.preco;

  return `
    <button class="produto-card" data-produto-id="${produto.id}">
      <div class="produto-card__info">
        ${produto.codigo ? `<div class="produto-card__codigo">#${escaparHtml(produto.codigo)}</div>` : ''}
        <div class="produto-card__nome">${escaparHtml(produto.nome)}</div>
        ${produto.descricao ? `<div class="produto-card__descricao">${escaparHtml(produto.descricao)}</div>` : ''}
        <div class="produto-card__preco-linha">
          <span class="produto-card__preco">${formatarMoeda(precoExibido)}</span>
          ${temPromocao ? `<span class="produto-card__preco-original">${formatarMoeda(produto.preco)}</span>` : ''}
        </div>
      </div>
      ${produto.foto_url
        ? `<img class="produto-card__foto" src="${escaparAspas(produto.foto_url)}" alt="${escaparHtml(produto.nome)}">`
        : `<div class="produto-card__foto produto-card__foto--vazia">🍽️</div>`}
    </button>
  `;
}

function montarRodape(estabelecimento) {
  const info = document.getElementById('rodape-info');
  const linhas = [];

  if (estabelecimento.endereco) {
    linhas.push(`📍 ${escaparHtml(estabelecimento.endereco)}`);
  }
  if (estabelecimento.telefone) {
    linhas.push(`📞 ${escaparHtml(estabelecimento.telefone)}`);
  }
  if (estabelecimento.whatsapp) {
    const whatsappLimpo = estabelecimento.whatsapp.replace(/\D/g, '');
    linhas.push(`<a href="https://wa.me/${whatsappLimpo}" target="_blank" rel="noopener">💬 Conversar no WhatsApp</a>`);
  }

  info.innerHTML = linhas.join('<br>');

  const redes = document.getElementById('rodape-redes');
  const linksRedes = [];
  if (estabelecimento.instagram) {
    const handle = estabelecimento.instagram.replace('@', '');
    linksRedes.push(`<a href="https://instagram.com/${escaparAspas(handle)}" target="_blank" rel="noopener">Instagram</a>`);
  }
  if (estabelecimento.facebook) {
    linksRedes.push(`<a href="${escaparAspas(estabelecimento.facebook)}" target="_blank" rel="noopener">Facebook</a>`);
  }
  redes.innerHTML = linksRedes.join('');
}

function abrirModalProduto(produtoId) {
  const produto = DADOS.produtos.find(p => p.id === produtoId);
  if (!produto) return;

  PRODUTO_SELECIONADO = produto;
  QUANTIDADE_MODAL = 1;

  const temPromocao = produto.preco_promocional && parseFloat(produto.preco_promocional) < parseFloat(produto.preco);
  const precoExibido = temPromocao ? produto.preco_promocional : produto.preco;

  const foto = document.getElementById('produto-modal-foto');
  if (produto.foto_url) {
    foto.src = produto.foto_url;
    foto.classList.remove('oculto');
  } else {
    foto.classList.add('oculto');
  }

  document.getElementById('produto-modal-codigo').textContent = produto.codigo ? `#${produto.codigo}` : '';
  document.getElementById('produto-modal-nome').textContent = produto.nome;
  document.getElementById('produto-modal-descricao').textContent = produto.descricao || '';
  document.getElementById('produto-modal-preco').textContent = formatarMoeda(precoExibido);
  document.getElementById('produto-modal-preco-original').textContent = temPromocao ? formatarMoeda(produto.preco) : '';
  document.getElementById('produto-modal-qtd').textContent = '1';
  document.getElementById('produto-modal-obs').value = '';

  document.getElementById('modal-produto').classList.remove('oculto');
}

function fecharModais() {
  document.querySelectorAll('.modal').forEach(m => m.classList.add('oculto'));
}

function configurarEventosGlobais() {
  // Verifica bloqueio por horario ao carregar os eventos
  verificarBloqueioHorario();

  document.querySelectorAll('[data-fechar-modal]').forEach(el => {
    el.addEventListener('click', fecharModais);
  });

  document.getElementById('produto-modal-menos').addEventListener('click', () => {
    if (QUANTIDADE_MODAL > 1) QUANTIDADE_MODAL--;
    document.getElementById('produto-modal-qtd').textContent = QUANTIDADE_MODAL;
  });
  document.getElementById('produto-modal-mais').addEventListener('click', () => {
    if (QUANTIDADE_MODAL < 50) QUANTIDADE_MODAL++;
    document.getElementById('produto-modal-qtd').textContent = QUANTIDADE_MODAL;
  });

  document.getElementById('produto-modal-adicionar').addEventListener('click', () => {
    if (!PRODUTO_SELECIONADO) return;

    const temPromocao = PRODUTO_SELECIONADO.preco_promocional &&
      parseFloat(PRODUTO_SELECIONADO.preco_promocional) < parseFloat(PRODUTO_SELECIONADO.preco);
    const precoUnitario = parseFloat(temPromocao ? PRODUTO_SELECIONADO.preco_promocional : PRODUTO_SELECIONADO.preco);

    Carrinho.adicionar({
      produto_id: PRODUTO_SELECIONADO.id,
      nome: PRODUTO_SELECIONADO.nome,
      preco_unitario: precoUnitario,
      quantidade: QUANTIDADE_MODAL,
      observacao: document.getElementById('produto-modal-obs').value.trim(),
      foto_url: PRODUTO_SELECIONADO.foto_url
    });

    fecharModais();
  });

  document.getElementById('botao-carrinho').addEventListener('click', abrirModalCarrinho);
  document.getElementById('botao-ir-checkout').addEventListener('click', irParaCheckout);
  document.getElementById('form-checkout').addEventListener('submit', finalizarPedido);

  inicializarMenuCliente();
}

function abrirModalCarrinho() {
  renderizarCarrinho();
  document.getElementById('carrinho-etapa-itens').classList.remove('oculto');
  document.getElementById('carrinho-etapa-checkout').classList.add('oculto');
  document.getElementById('carrinho-etapa-confirmacao').classList.add('oculto');
  document.getElementById('modal-carrinho').classList.remove('oculto');
}

function renderizarCarrinho() {
  const itens = Carrinho.listar();
  const lista = document.getElementById('carrinho-lista');
  const vazio = document.getElementById('carrinho-vazio');
  const botaoContinuar = document.getElementById('botao-ir-checkout');

  if (itens.length === 0) {
    lista.innerHTML = '';
    vazio.classList.remove('oculto');
    botaoContinuar.disabled = true;
  } else {
    vazio.classList.add('oculto');
    botaoContinuar.disabled = false;
    lista.innerHTML = itens.map((item, indice) => `
      <div class="carrinho-item">
        <div class="carrinho-item__info">
          <div class="carrinho-item__nome">${escaparHtml(item.nome)}</div>
          ${item.observacao ? `<div class="carrinho-item__obs">${escaparHtml(item.observacao)}</div>` : ''}
          <div class="carrinho-item__preco">${formatarMoeda(item.preco_unitario * item.quantidade)}</div>
        </div>
        <div class="carrinho-item__controles">
          <button data-acao="menos" data-indice="${indice}">−</button>
          <span>${item.quantidade}</span>
          <button data-acao="mais" data-indice="${indice}">+</button>
        </div>
      </div>
    `).join('');

    lista.querySelectorAll('[data-acao]').forEach(botao => {
      botao.addEventListener('click', () => {
        const indice = parseInt(botao.getAttribute('data-indice'), 10);
        const delta = botao.getAttribute('data-acao') === 'mais' ? 1 : -1;
        Carrinho.alterarQuantidade(indice, delta);
        renderizarCarrinho();
      });
    });
  }

  document.getElementById('carrinho-subtotal').textContent = formatarMoeda(Carrinho.calcularSubtotal());
}

function irParaCheckout() {
  if (Carrinho.listar().length === 0) return;
  document.getElementById('carrinho-etapa-itens').classList.add('oculto');
  document.getElementById('carrinho-etapa-checkout').classList.remove('oculto');
  document.getElementById('checkout-total').textContent = formatarMoeda(Carrinho.calcularSubtotal());
}

async function finalizarPedido(evento) {
  evento.preventDefault();

  const botao = document.getElementById('botao-finalizar-pedido');
  botao.disabled = true;
  botao.textContent = 'Enviando...';

  try {
    const formaPagamento = document.querySelector('input[name="pagamento"]:checked').value;

    const dadosPedido = {
      cliente_nome: document.getElementById('checkout-nome').value.trim(),
      cliente_telefone: document.getElementById('checkout-telefone').value.trim(),
      cliente_endereco: document.getElementById('checkout-endereco').value.trim(),
      observacoes: document.getElementById('checkout-observacoes').value.trim(),
      forma_pagamento: formaPagamento,
      taxa_entrega: 0,
      itens: Carrinho.listar().map(item => ({
        produto_id: item.produto_id,
        quantidade: item.quantidade,
        observacao: item.observacao
      }))
    };

    // Salva dados do cliente no localStorage (nome, telefone, endereco)
    if (typeof salvarDadosCliente === 'function') {
      try {
        salvarDadosCliente({
          nome: dadosPedido.cliente_nome,
          telefone: dadosPedido.cliente_telefone,
          endereco: dadosPedido.cliente_endereco
        });
      } catch (err) {
        // Não interrompe o fluxo de envio do pedido se houver erro ao salvar
        console.warn('Falha ao salvar dados do cliente:', err);
      }
    }

    const resultado = await enviarPedido(SLUG_ESTABELECIMENTO, dadosPedido);
    mostrarConfirmacao(resultado, formaPagamento);
    Carrinho.limpar();

  } catch (erro) {
    alert(erro.message || 'Nao foi possivel enviar o pedido. Tente novamente.');
  } finally {
    botao.disabled = false;
    botao.textContent = 'Finalizar pedido';
  }
}

function mostrarConfirmacao(resultado, formaPagamento) {
  document.getElementById('carrinho-etapa-checkout').classList.add('oculto');
  document.getElementById('carrinho-etapa-confirmacao').classList.remove('oculto');

  const conteudo = document.getElementById('confirmacao-conteudo');
  const whatsapp = DADOS.estabelecimento.whatsapp;

  if (formaPagamento === 'pix' && resultado.pagamento?.qr_code_base64) {
    conteudo.innerHTML = `
      <div class="confirmacao-pix">
        <p>Escaneie o QR Code para pagar via Pix:</p>
        <img src="data:image/png;base64,${resultado.pagamento.qr_code_base64}" alt="QR Code Pix">
        <p style="font-size:0.8rem; color: var(--cor-texto-claro);">Ou copie o codigo:</p>
        <textarea class="confirmacao-pix__copiar" readonly rows="3">${resultado.pagamento.qr_code || ''}</textarea>
        <div class="confirmacao-status" id="status-pagamento-pix">Aguardando pagamento...</div>
      </div>
    `;
    monitorarPagamentoPix(resultado.pedido.id);
  } else if (formaPagamento === 'cartao' && resultado.pagamento?.ticket_url) {
    conteudo.innerHTML = `
      <div class="confirmacao-sucesso">
        <div class="confirmacao-sucesso__icone">💳</div>
        <p>Clique no botao abaixo para concluir o pagamento com cartao.</p>
        <a class="botao-primario" style="display:block; text-align:center; text-decoration:none; margin-top:14px;"
           href="${escaparAspas(resultado.pagamento.ticket_url)}" target="_blank" rel="noopener">
          Pagar com cartao
        </a>
      </div>
    `;
  } else {
    conteudo.innerHTML = `
      <div class="confirmacao-sucesso">
        <div class="confirmacao-sucesso__icone">✅</div>
        <p>Seu pedido <strong>#${resultado.pedido.id.substring(0, 8)}</strong> foi recebido!</p>
        <p style="margin-top:8px; color: var(--cor-texto-claro);">
          ${formaPagamento === 'dinheiro' ? 'Pagamento em dinheiro na entrega.' : ''}
        </p>
        ${whatsapp ? `
          <a class="botao-primario" style="display:block; text-align:center; text-decoration:none; margin-top:14px;"
             href="https://wa.me/${whatsapp.replace(/\D/g, '')}" target="_blank" rel="noopener">
            Acompanhar pelo WhatsApp
          </a>` : ''}
      </div>
    `;
  }
}

async function monitorarPagamentoPix(pedidoId) {
  const elementoStatus = document.getElementById('status-pagamento-pix');
  let tentativas = 0;

  const intervalo = setInterval(async () => {
    tentativas++;
    if (tentativas > 40) {
      clearInterval(intervalo);
      if (elementoStatus) elementoStatus.textContent = 'Ainda nao identificamos o pagamento. Voce pode verificar pelo WhatsApp.';
      return;
    }

    try {
      const status = await consultarStatusPedido(SLUG_ESTABELECIMENTO, pedidoId);
      if (!elementoStatus) { clearInterval(intervalo); return; }

      if (status.status_pagamento === 'aprovado') {
        elementoStatus.textContent = '✅ Pagamento confirmado!';
        elementoStatus.style.color = 'var(--cor-sucesso)';
        clearInterval(intervalo);
      } else if (status.status_pagamento === 'rejeitado' || status.status_pagamento === 'cancelado') {
        elementoStatus.textContent = '❌ Pagamento nao foi concluido.';
        elementoStatus.style.color = 'var(--cor-erro)';
        clearInterval(intervalo);
      }
    } catch (erro) {
    }
  }, 6000);
}

function formatarMoeda(valor) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(parseFloat(valor) || 0);
}

function escaparHtml(texto) {
  const div = document.createElement('div');
  div.textContent = texto ?? '';
  return div.innerHTML;
}

function escaparAspas(texto) {
  return (texto ?? '').replace(/'/g, '%27').replace(/"/g, '%22');
}

// Nova função: verifica se o estabelecimento está fora do horário e bloqueia botões
function verificarBloqueioHorario() {
  const horarios = DADOS?.estabelecimento?.horario_funcionamento;
  if (!horarios || Object.keys(horarios).length === 0) return;

  const ORDEM_DIAS_LOCAL = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
  const diaAtual = ORDEM_DIAS_LOCAL[new Date().getDay()];
  const horarioHoje = horarios[diaAtual];

  if (!horarioHoje || horarioHoje.toLowerCase() === 'fechado') {
    bloquearPedidos('Estabelecimento fechado hoje. Pedidos nao sao aceitos no momento.');
    return;
  }

  const [abertura, fechamento] = horarioHoje.split('-');
  const agora = new Date();
  const minutosAgora = agora.getHours() * 60 + agora.getMinutes();
  const minutosAbertura = converterParaMinutos(abertura);
  const minutosFechamento = converterParaMinutos(fechamento);

  if (minutosAgora < minutosAbertura || minutosAgora > minutosFechamento) {
    const abre = abertura.trim();
    const fecha = fechamento.trim();
    bloquearPedidos(`Estabelecimento fechado agora. Funcionamento: ${abre} ate ${fecha}.`);
  }
}

function bloquearPedidos(mensagem) {
  const botaoCarrinho = document.getElementById('botao-carrinho');
  if (botaoCarrinho) {
    botaoCarrinho.disabled = true;
    botaoCarrinho.title = mensagem;
    botaoCarrinho.style.opacity = '0.4';
    botaoCarrinho.style.cursor = 'not-allowed';
  }
  const botaoFinalizar = document.getElementById('botao-finalizar-pedido');
  if (botaoFinalizar) {
    botaoFinalizar.disabled = true;
  }
  const botaoContinuar = document.getElementById('botao-ir-checkout');
  if (botaoContinuar) {
    botaoContinuar.disabled = true;
  }

  const aviso = document.createElement('div');
  aviso.style.cssText = 'background:#fef2f2;color:#b00;padding:10px 20px;font-size:0.85rem;font-weight:600;text-align:center;';
  aviso.textContent = mensagem;
  const app = document.getElementById('app');
  if (app) app.insertBefore(aviso, app.firstChild);
}

// --- Restaurando funções do Menu Cliente solicitadas ---
function inicializarMenuCliente() {
  const botaoMenu = document.getElementById('botao-menu-cliente');
  const modal = document.getElementById('modal-menu-cliente');
  if (!botaoMenu || !modal) return;

  botaoMenu.addEventListener('click', () => {
    preencherFormularioDadosCliente();
    modal.classList.remove('oculto');
  });

  modal.querySelector('[data-fechar-modal]').addEventListener('click', () => {
    modal.classList.add('oculto');
  });

  modal.querySelectorAll('[data-aba-cliente]').forEach(botao => {
    botao.addEventListener('click', () => {
      modal.querySelectorAll('[data-aba-cliente]').forEach(b => b.classList.remove('ativo'));
      modal.querySelectorAll('.aba-cliente').forEach(a => a.classList.add('oculto'));
      botao.classList.add('ativo');
      document.getElementById(`aba-cliente-${botao.dataset.abaCliente}`).classList.remove('oculto');
      if (botao.dataset.abaCliente === 'pedidos') carregarPedidosCliente();
    });
  });

  document.getElementById('form-dados-cliente').addEventListener('submit', (evento) => {
    evento.preventDefault();
    salvarDadosCliente({
      nome: document.getElementById('dados-nome').value.trim(),
      telefone: document.getElementById('dados-telefone').value.trim(),
      endereco: document.getElementById('dados-endereco').value.trim()
    });
    modal.classList.add('oculto');
  });
}

function preencherFormularioDadosCliente() {
  const dados = obterDadosCliente();
  document.getElementById('dados-nome').value = dados.nome;
  document.getElementById('dados-telefone').value = dados.telefone;
  document.getElementById('dados-endereco').value = dados.endereco;

  const linkWhats = document.getElementById('link-whatsapp-menu');
  if (linkWhats && typeof estabelecimento !== 'undefined' && estabelecimento.whatsapp) {
    linkWhats.href = `https://wa.me/${estabelecimento.whatsapp.replace(/\D/g, '')}`;
  }
}

async function carregarPedidosCliente() {
  const container = document.getElementById('lista-pedidos-cliente');
  const dados = obterDadosCliente();

  if (!dados.telefone) {
    container.innerHTML = '<p>Preencha seu telefone em "Meus dados" para ver seu histórico.</p>';
    return;
  }

  container.innerHTML = '<p>Carregando pedidos...</p>';

  try {
    const pedidos = await buscarPedidosCliente(SLUG_ESTABELECIMENTO, dados.telefone);

    if (pedidos.length === 0) {
      container.innerHTML = '<p>Você ainda não tem pedidos.</p>';
      return;
    }

    container.innerHTML = pedidos.map(pedido => `
      <div class="pedido-cliente-item">
        <div class="pedido-cliente-item__topo">
          <span>${new Date(pedido.criado_em).toLocaleDateString('pt-BR')}</span>
          <span class="pedido-cliente-item__status">${traduzirStatus(pedido.status_pedido)}</span>
        </div>
        <div class="pedido-cliente-item__total">R$ ${Number(pedido.total).toFixed(2)}</div>
      </div>
    `).join('');
  } catch (erro) {
    container.innerHTML = '<p>Não foi possível carregar seus pedidos agora.</p>';
  }
}

function traduzirStatus(status) {
  const mapa = {
    novo: 'Recebido',
    preparando: 'Em preparo',
    pronto: 'Pronto',
    entregue: 'Entregue',
    cancelado: 'Cancelado'
  };
  return mapa[status] || status;
}
