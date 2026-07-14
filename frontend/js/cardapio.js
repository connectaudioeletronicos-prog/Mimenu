let DADOS = null;
let PRODUTO_SELECIONADO = null;
let QUANTIDADE_MODAL = 1;
let INTERVALO_ACOMPANHAMENTO = null;

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
    ? estabelecimento.tema : 'classico';
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
  if (!horarios || Object.keys(horarios).length === 0) { elemento.textContent = ''; return; }
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
  const minAbertura = converterParaMinutos(abertura);
  const minFechamento = converterParaMinutos(fechamento);
  const passaDaMeiaNoite = minFechamento < minAbertura;
  const aberto = passaDaMeiaNoite
    ? (minutosAgora >= minAbertura || minutosAgora <= minFechamento)
    : (minutosAgora >= minAbertura && minutosAgora <= minFechamento);
  elemento.textContent = aberto ? `Aberto agora - ate ${fechamento}` : `Fechado agora - abre as ${abertura}`;
  elemento.className = `apresentacao__status apresentacao__status--${aberto ? 'aberto' : 'fechado'}`;
}

function converterParaMinutos(horaTexto) {
  const [h, m] = horaTexto.trim().split(':').map(Number);
  return h * 60 + m;
}

function montarPromocoes(promocoes, produtos) {
  const secao = document.getElementById('secao-promocoes');
  const lista = document.getElementById('lista-promocoes');
  if (!promocoes || promocoes.length === 0) { secao.classList.add('oculto'); return; }
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
    if (produtoId) botao.addEventListener('click', () => abrirModalProduto(produtoId));
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
      const destino = document.getElementById(`categoria-secao-${botao.getAttribute('data-categoria-id')}`);
      if (destino) destino.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

function obterEmojiCategoria(nome) {
  const n = nome.toLowerCase();
  if (n.includes('pizza')) return '🍕';
  if (n.includes('esfiha') || n.includes('esfirra')) return '🥙';
  if (n.includes('bebida') || n.includes('suco') || n.includes('refri')) return '🥤';
  if (n.includes('lanche') || n.includes('burger') || n.includes('hamb')) return '🍔';
  if (n.includes('doce') || n.includes('sobremesa')) return '🍰';
  if (n.includes('salada')) return '🥗';
  if (n.includes('massa') || n.includes('macarrao')) return '🍝';
  return '🍽️';
}

function montarProdutos(categorias, produtos) {
  const secao = document.getElementById('secao-produtos');
  const html = categorias.map(categoria => {
    const produtosDaCategoria = produtos.filter(p => p.categoria_id === categoria.id);
    if (produtosDaCategoria.length === 0) return '';
    return `
      <div class="produtos-grupo" id="categoria-secao-${categoria.id}">
        <h3 class="produtos-grupo__titulo">${escaparHtml(categoria.nome)}</h3>
        ${produtosDaCategoria.map(produto => montarCardProduto(produto)).join('')}
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
  const redes = document.getElementById('rodape-redes');

  const telefone = estabelecimento.telefone || '';
  const whatsapp = (estabelecimento.whatsapp || '').replace(/\D/g, '');
  const endereco = estabelecimento.endereco || '';
  const email = estabelecimento.email_contato || '';
  const corPrincipal = estabelecimento.cor_principal || '#E63946';

  const linkMapa = endereco
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco)}`
    : '#';

  const SVG = {
    localizacao: `<svg viewBox="0 0 24 24" fill="currentColor" width="26" height="26"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>`,
    telefone: `<svg viewBox="0 0 24 24" fill="currentColor" width="26" height="26"><path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.01-.24c1.12.37 2.33.57 3.58.57a1 1 0 011 1V20a1 1 0 01-1 1C10.61 21 3 13.39 3 4a1 1 0 011-1h3.5a1 1 0 011 1c0 1.25.2 2.45.57 3.57a1 1 0 01-.25 1.02l-2.2 2.2z"/></svg>`,
    whatsapp: `<svg viewBox="0 0 24 24" fill="currentColor" width="26" height="26"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.978-1.41A9.962 9.962 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18a7.946 7.946 0 01-4.337-1.287l-.31-.184-3.233.915.876-3.154-.202-.323A7.944 7.944 0 014 12c0-4.418 3.582-8 8-8s8 3.582 8 8-3.582 8-8 8z"/></svg>`,
    email: `<svg viewBox="0 0 24 24" fill="currentColor" width="26" height="26"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>`,
    instagram: `<svg viewBox="0 0 24 24" fill="currentColor" width="26" height="26"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>`,
    facebook: `<svg viewBox="0 0 24 24" fill="currentColor" width="26" height="26"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>`,
    linkedin: `<svg viewBox="0 0 24 24" fill="currentColor" width="26" height="26"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>`
  };

  const cores = {
    localizacao: '#EA4335',
    telefone: '#34A853',
    whatsapp: '#25D366',
    email: '#4285F4',
    instagram: '#E1306C',
    facebook: '#1877F2',
    linkedin: '#0A66C2'
  };

  let icones = '';

  if (endereco) {
    icones += `
      <a href="${linkMapa}" target="_blank" class="rodape-icone" title="Ver no mapa"
         style="color:${cores.localizacao};box-shadow:0 2px 8px rgba(0,0,0,0.2);">
        ${SVG.localizacao}
        <span>Localização</span>
      </a>`;
  }

  if (telefone) {
    icones += `
      <a href="tel:${telefone.replace(/\D/g,'')}" class="rodape-icone" title="Ligar"
         style="color:${cores.telefone};box-shadow:0 2px 8px rgba(0,0,0,0.2);">
        ${SVG.telefone}
        <span>Telefone</span>
      </a>`;
  }

  if (whatsapp) {
    icones += `
      <a href="https://wa.me/${whatsapp}" target="_blank" class="rodape-icone" title="WhatsApp"
         style="color:${cores.whatsapp};box-shadow:0 2px 8px rgba(0,0,0,0.2);">
        ${SVG.whatsapp}
        <span>WhatsApp</span>
      </a>`;
  }

  if (email) {
    icones += `
      <a href="mailto:${email}" class="rodape-icone" title="E-mail"
         style="color:${cores.email};box-shadow:0 2px 8px rgba(0,0,0,0.2);">
        ${SVG.email}
        <span>E-mail</span>
      </a>`;
  }

  if (estabelecimento.instagram) {
    let insta = estabelecimento.instagram.trim();
    if (!insta.startsWith('http')) insta = `https://instagram.com/${insta.replace('@','')}`;
    icones += `
      <a href="${insta}" target="_blank" class="rodape-icone" title="Instagram"
         style="color:${cores.instagram};box-shadow:0 2px 8px rgba(0,0,0,0.2);">
        ${SVG.instagram}
        <span>Instagram</span>
      </a>`;
  }

  if (estabelecimento.facebook) {
    icones += `
      <a href="${estabelecimento.facebook}" target="_blank" class="rodape-icone" title="Facebook"
         style="color:${cores.facebook};box-shadow:0 2px 8px rgba(0,0,0,0.2);">
        ${SVG.facebook}
        <span>Facebook</span>
      </a>`;
  }

  if (estabelecimento.linkedin) {
    icones += `
      <a href="${estabelecimento.linkedin}" target="_blank" class="rodape-icone" title="LinkedIn"
         style="color:${cores.linkedin};box-shadow:0 2px 8px rgba(0,0,0,0.2);">
        ${SVG.linkedin}
        <span>LinkedIn</span>
      </a>`;
  }

  info.innerHTML = `<div class="rodape-icones">${icones}</div>`;

  redes.innerHTML = `
    <div class="rodape-links">
      <a href="termos.html" target="_blank">Termos de Uso</a>
      <span>•</span>
      <a href="cookies.html" target="_blank">Cookies</a>
      <span>•</span>
      <a href="privacidade.html" target="_blank">Política de Privacidade</a>
    </div>
  `;
}
function abrirModalProduto(produtoId) {
  const produto = DADOS.produtos.find(p => p.id === produtoId);
  if (!produto) return;
  PRODUTO_SELECIONADO = produto;
  QUANTIDADE_MODAL = 1;
  const temPromocao = produto.preco_promocional && parseFloat(produto.preco_promocional) < parseFloat(produto.preco);
  const precoExibido = temPromocao ? produto.preco_promocional : produto.preco;
  const foto = document.getElementById('produto-modal-foto');
  if (produto.foto_url) { foto.src = produto.foto_url; foto.classList.remove('oculto'); }
  else foto.classList.add('oculto');
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
  verificarBloqueioHorario();
  document.querySelectorAll('[data-fechar-modal]').forEach(el => el.addEventListener('click', fecharModais));
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
    Carrinho.adicionar({
      produto_id: PRODUTO_SELECIONADO.id,
      nome: PRODUTO_SELECIONADO.nome,
      preco_unitario: parseFloat(temPromocao ? PRODUTO_SELECIONADO.preco_promocional : PRODUTO_SELECIONADO.preco),
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
  const dados = obterDadosCliente();
  if (dados.nome) document.getElementById('checkout-nome').value = dados.nome;
  if (dados.telefone) document.getElementById('checkout-telefone').value = dados.telefone;

  const campoTelefone = document.getElementById('checkout-telefone');
  if (campoTelefone && !campoTelefone.dataset.mascara) {
    campoTelefone.dataset.mascara='1';
    campoTelefone.addEventListener('input', function(){
      let numeros=this.value.replace(/\D/g,'').substring(0,11);
      if(numeros.length===0)this.value='';
      else if(numeros.length<=2)this.value='('+numeros;
      else this.value='('+numeros.substring(0,2)+') '+numeros.substring(2);
    });
    campoTelefone.dispatchEvent(new Event('input'));
  }
  if (dados.rua) document.getElementById('checkout-rua').value = dados.rua;
  if (dados.numero) document.getElementById('checkout-numero').value = dados.numero;
  if (dados.cep) document.getElementById('checkout-cep').value = dados.cep;
  aplicarMascaraCep(document.getElementById('checkout-cep'));

  document.getElementById('carrinho-etapa-itens').classList.add('oculto');
  document.getElementById('carrinho-etapa-checkout').classList.remove('oculto');
  document.getElementById('checkout-total').textContent = formatarMoeda(Carrinho.calcularSubtotal());
}

function aplicarMascaraTelefone(campo) {
  if (!campo || campo.dataset.mascara) return;
  campo.dataset.mascara = '1';
  campo.addEventListener('input', function () {
    let numeros = this.value.replace(/\D/g, '').substring(0, 11);
    if (numeros.length === 0) this.value = '';
    else if (numeros.length <= 2) this.value = '(' + numeros;
    else this.value = '(' + numeros.substring(0, 2) + ') ' + numeros.substring(2);
  });
}

function aplicarMascaraCep(campo) {
  if (!campo || campo.dataset.mascara) return;
  campo.dataset.mascara = '1';
  campo.addEventListener('input', function () {
    let numeros = this.value.replace(/\D/g, '').substring(0, 8);
    if (numeros.length <= 5) this.value = numeros;
    else this.value = numeros.substring(0, 5) + '-' + numeros.substring(5);
  });
}

async function finalizarPedido(evento) {
  evento.preventDefault();

  const nome = document.getElementById('checkout-nome').value.trim();
  const telefone = document.getElementById('checkout-telefone').value.trim();
  const rua = document.getElementById('checkout-rua').value.trim();
  const numero = document.getElementById('checkout-numero').value.trim();
  const cep = document.getElementById('checkout-cep').value.trim();

  const nomePartes = nome.split(/\s+/).filter(p => p.length > 0);
  if (nomePartes.length < 2) {
    alert('Por favor, informe seu nome completo (nome e sobrenome).');
    return;
  }

  const regexTelefone = /^\(\d{2}\)\s\d{9}$/;
  if (!regexTelefone.test(telefone)) {
    alert('Telefone invalido. Use o formato: (11) 999999999');
    return;
  }

  if (!rua || !numero) {
    alert('Por favor, informe rua e numero para entrega.');
    return;
  }

  const regexCep = /^\d{5}-\d{3}$/;
  if (!regexCep.test(cep)) {
    alert('CEP invalido. Use o formato: 99999-999');
    return;
  }

  const endereco = `${rua}, ${numero}`;

  const botao = document.getElementById('botao-finalizar-pedido');
  botao.disabled = true;
  botao.textContent = 'Enviando...';

  try {
    const formaPagamento = document.querySelector('input[name="pagamento"]:checked').value;
    const dadosPedido = {
      cliente_nome: nome,
      cliente_telefone: telefone,
      cliente_endereco: endereco,
      cliente_cep: cep,
      observacoes: document.getElementById('checkout-observacoes').value.trim(),
      forma_pagamento: formaPagamento,
      taxa_entrega: 0,
      itens: Carrinho.listar().map(item => ({
        produto_id: item.produto_id,
        quantidade: item.quantidade,
        observacao: item.observacao
      }))
    };

    salvarDadosCliente({ nome, telefone, rua, numero, cep });

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
        <p style="font-size:0.8rem;color:var(--cor-texto-claro);">Ou copie o codigo:</p>
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
        <a class="botao-primario" style="display:block;text-align:center;text-decoration:none;margin-top:14px;"
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
        <p style="margin-top:8px;color:var(--cor-texto-claro);">
          ${formaPagamento === 'dinheiro' ? 'Pagamento em dinheiro na entrega.' : ''}
        </p>
        ${whatsapp ? `
          <a class="botao-primario" style="display:block;text-align:center;text-decoration:none;margin-top:14px;"
             href="https://wa.me/${whatsapp.replace(/\D/g, '')}" target="_blank" rel="noopener">
            Falar no WhatsApp
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
      if (elementoStatus) elementoStatus.textContent = 'Ainda nao identificamos o pagamento. Verifique pelo WhatsApp.';
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
    } catch (erro) {}
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
  const minAbertura = converterParaMinutos(abertura);
  const minFechamento = converterParaMinutos(fechamento);
  const passaDaMeiaNoite = minFechamento < minAbertura;
  const dentroDoHorario = passaDaMeiaNoite
    ? (minutosAgora >= minAbertura || minutosAgora <= minFechamento)
    : (minutosAgora >= minAbertura && minutosAgora <= minFechamento);
  if (!dentroDoHorario) {
    bloquearPedidos(`Estabelecimento fechado agora. Funcionamento: ${abertura.trim()} ate ${fechamento.trim()}.`);
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
  if (botaoFinalizar) botaoFinalizar.disabled = true;
  const botaoContinuar = document.getElementById('botao-ir-checkout');
  if (botaoContinuar) botaoContinuar.disabled = true;
  const aviso = document.createElement('div');
  aviso.style.cssText = 'background:#fef2f2;color:#b00;padding:10px 20px;font-size:0.85rem;font-weight:600;text-align:center;';
  aviso.textContent = mensagem;
  const app = document.getElementById('app');
  if (app) app.insertBefore(aviso, app.firstChild);
}

function obterDadosCliente() {
  try { return JSON.parse(localStorage.getItem('dados-cliente') || '{}'); }
  catch { return {}; }
}

function salvarDadosCliente(dados) {
  const atual = obterDadosCliente();
  localStorage.setItem('dados-cliente', JSON.stringify({ ...atual, ...dados }));
}

function inicializarMenuCliente() {
  const botaoAbrir = document.getElementById('botao-menu-cliente');
  const telaCliente = document.getElementById('tela-cliente');
  const botaoFechar = document.getElementById('botao-fechar-cliente');
  if (!botaoAbrir || !telaCliente || !botaoFechar) return;

  botaoAbrir.addEventListener('click', () => {
    preencherFormularioDadosCliente();
    telaCliente.classList.remove('oculto');
    document.getElementById('app').classList.add('oculto');
  });

  botaoFechar.addEventListener('click', () => {
    if (INTERVALO_ACOMPANHAMENTO) { clearInterval(INTERVALO_ACOMPANHAMENTO); INTERVALO_ACOMPANHAMENTO = null; }
    telaCliente.classList.add('oculto');
    document.getElementById('app').classList.remove('oculto');
  });

  telaCliente.querySelectorAll('[data-aba-cliente]').forEach(botao => {
    botao.addEventListener('click', () => {
      telaCliente.querySelectorAll('[data-aba-cliente]').forEach(b => b.classList.remove('ativo'));
      telaCliente.querySelectorAll('.aba-cliente').forEach(a => a.classList.add('oculto'));
      botao.classList.add('ativo');
      document.getElementById(`aba-cliente-${botao.dataset.abaCliente}`).classList.remove('oculto');
      if (botao.dataset.abaCliente === 'pedidos') carregarPedidosCliente();
    });
  });

  aplicarMascaraCep(document.getElementById('dados-cep'));
  aplicarMascaraTelefone(document.getElementById('dados-telefone'));

  document.getElementById('form-dados-cliente').addEventListener('submit', (evento) => {
    evento.preventDefault();
    const cep = document.getElementById('dados-cep').value.trim();
    if (cep && !/^\d{5}-\d{3}$/.test(cep)) {
      alert('CEP invalido. Use o formato: 99999-999');
      return;
    }
    salvarDadosCliente({
      nome: document.getElementById('dados-nome').value.trim(),
      telefone: document.getElementById('dados-telefone').value.trim(),
      rua: document.getElementById('dados-rua').value.trim(),
      numero: document.getElementById('dados-numero').value.trim(),
      cep
    });
    telaCliente.classList.add('oculto');
    document.getElementById('app').classList.remove('oculto');
  });

  const linkWhats = document.getElementById('link-whatsapp-menu');
  if (linkWhats && DADOS?.estabelecimento?.whatsapp) {
    linkWhats.href = `https://wa.me/${DADOS.estabelecimento.whatsapp.replace(/\D/g, '')}`;
  }
}

function preencherFormularioDadosCliente() {
  const dados = obterDadosCliente();
  document.getElementById('dados-nome').value = dados.nome || '';
  document.getElementById('dados-telefone').value = dados.telefone || '';
  document.getElementById('dados-rua').value = dados.rua || '';
  document.getElementById('dados-numero').value = dados.numero || '';
  document.getElementById('dados-cep').value = dados.cep || '';
}

async function carregarPedidosCliente() {
  const container = document.getElementById('lista-pedidos-cliente');
  const dados = obterDadosCliente();

  if (INTERVALO_ACOMPANHAMENTO) { clearInterval(INTERVALO_ACOMPANHAMENTO); INTERVALO_ACOMPANHAMENTO = null; }

  if (!dados.telefone) {
    container.innerHTML = '<p style="color:#666;font-size:0.88rem;">Preencha seu telefone em "Meus dados" para ver seu historico.</p>';
    return;
  }

  container.innerHTML = '<p style="color:#666;font-size:0.88rem;">Carregando pedidos...</p>';

  try {
    const pedidos = await buscarPedidosCliente(SLUG_ESTABELECIMENTO, dados.telefone);
    if (pedidos.length === 0) {
      container.innerHTML = '<p style="color:#666;font-size:0.88rem;">Voce ainda nao tem pedidos.</p>';
      return;
    }
    renderizarPedidosCliente(pedidos);
  } catch (erro) {
    container.innerHTML = '<p style="color:#666;font-size:0.88rem;">Nao foi possivel carregar seus pedidos agora.</p>';
  }
}

function renderizarPedidosCliente(pedidos) {
  const container = document.getElementById('lista-pedidos-cliente');
  container.innerHTML = pedidos.map(pedido => `
    <div class="pedido-detalhe" data-pedido-id="${pedido.id}">
      <div class="pedido-detalhe__topo">
        <span class="pedido-detalhe__data">${new Date(pedido.criado_em).toLocaleDateString('pt-BR')}</span>
        <span class="pedido-detalhe__status">${traduzirStatus(pedido.status_pedido)}</span>
      </div>
      <div class="pedido-detalhe__total">${formatarMoeda(pedido.total)}</div>
      <div class="acompanhamento-box oculto" id="acomp-${pedido.id}"></div>
    </div>
  `).join('');

  container.querySelectorAll('.pedido-detalhe').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.getAttribute('data-pedido-id');
      const jaSelecionado = card.classList.contains('selecionado');

      container.querySelectorAll('.pedido-detalhe').forEach(c => {
        c.classList.remove('selecionado');
        c.querySelector('.acompanhamento-box').classList.add('oculto');
      });

      if (INTERVALO_ACOMPANHAMENTO) { clearInterval(INTERVALO_ACOMPANHAMENTO); INTERVALO_ACOMPANHAMENTO = null; }

      if (!jaSelecionado) {
        card.classList.add('selecionado');
        const box = document.getElementById(`acomp-${id}`);
        box.classList.remove('oculto');
        const pedido = pedidos.find(p => p.id === id);
        renderizarTimeline(box, pedido.status_pedido);
        iniciarAcompanhamento(id, box);
      }
    });
  });
}

function renderizarTimeline(box, statusAtual) {
  const passos = [
    { status: 'novo', icone: '📋', titulo: 'Pedido recebido', desc: 'Seu pedido foi recebido pelo estabelecimento.' },
    { status: 'preparando', icone: '🍳', titulo: 'Em preparo', desc: 'Seu pedido esta sendo preparado.' },
    { status: 'saiu_entrega', icone: '🛵', titulo: 'Saiu para entrega', desc: 'Seu pedido esta a caminho!' },
    { status: 'entregue', icone: '✅', titulo: 'Entregue', desc: 'Pedido entregue. Bom apetite!' }
  ];

  const ordem = ['novo', 'preparando', 'saiu_entrega', 'entregue'];
  const indiceAtual = ordem.indexOf(statusAtual);

  box.innerHTML = `
    <div class="acompanhamento-box__titulo">Acompanhamento do pedido</div>
    <div class="pedido-timeline">
      ${passos.map((passo, i) => {
        const concluido = i < indiceAtual;
        const ativo = i === indiceAtual;
        const classe = concluido ? 'concluido' : ativo ? 'ativo' : '';
        return `
          <div class="pedido-timeline__passo ${classe}">
            <div class="pedido-timeline__icone">${passo.icone}</div>
            <div class="pedido-timeline__texto">
              <div class="pedido-timeline__titulo">${passo.titulo}</div>
              <div class="pedido-timeline__desc">${passo.desc}</div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
    ${statusAtual !== 'entregue' && statusAtual !== 'cancelado'
      ? '<div class="acompanhamento-atualizando">Atualizando automaticamente a cada 30 segundos...</div>'
      : ''}
  `;
}

function iniciarAcompanhamento(pedidoId, box) {
  INTERVALO_ACOMPANHAMENTO = setInterval(async () => {
    try {
      const status = await consultarStatusPedido(SLUG_ESTABELECIMENTO, pedidoId);
      const card = document.querySelector(`[data-pedido-id="${pedidoId}"]`);
      if (!card) { clearInterval(INTERVALO_ACOMPANHAMENTO); return; }
      const statusSpan = card.querySelector('.pedido-detalhe__status');
      if (statusSpan) statusSpan.textContent = traduzirStatus(status.status_pedido);
      renderizarTimeline(box, status.status_pedido);
      if (status.status_pedido === 'entregue' || status.status_pedido === 'cancelado') {
        clearInterval(INTERVALO_ACOMPANHAMENTO);
        INTERVALO_ACOMPANHAMENTO = null;
      }
    } catch (erro) {}
  }, 30000);
}

function traduzirStatus(status) {
  const mapa = {
    novo: 'Recebido',
    preparando: 'Em preparo',
    saiu_entrega: 'Saiu para entrega',
    pronto: 'Pronto',
    entregue: 'Entregue',
    cancelado: 'Cancelado'
  };
  return mapa[status] || status;
}
