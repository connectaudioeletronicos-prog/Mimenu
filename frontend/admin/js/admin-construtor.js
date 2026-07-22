// ===================================================================
// Painel admin: Construtor de pagina (arrastar e soltar)
//
// Junta carrosseis, vitrines e caixas de texto num unico mapa da
// pagina publica, respeitando os mesmos pontos de posicao (topo,
// apos-cabecalho, entre categorias, apos-produtos, antes-rodape) ja
// usados pelo sistema (ver backend/src/utils/posicao.js). Arrastar um
// bloco atualiza automaticamente sua posicao/ordem via os mesmos
// endpoints ja usados no CRUD normal (apiAtualizarCarrossel,
// apiAtualizarVitrine, apiAtualizarCaixaTexto) - nao existe endpoint
// novo, so essa tela nova de visualizacao/reordenacao.
// ===================================================================

let SORTABLE_CONSTRUTOR = null;

// Monta a sequencia de "pontos fixos" da pagina: os 5 fixos de sempre,
// com as categorias intercaladas em ordem (pra permitir posicionar um
// bloco logo apos qualquer categoria especifica do cardapio).
function montarSlotsConstrutor() {
  const categorias = [...(ESTADO.categorias || [])].sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
  const chaves = [
    'topo',
    'apos-cabecalho',
    ...categorias.map(cat => `apos-categoria:${cat.id}`),
    'apos-categorias',
    'apos-produtos',
    'antes-rodape'
  ];
  return chaves.map(chave => ({ chave, rotulo: nomePosicaoLegivel(chave) }));
}

// Reune os 3 tipos de bloco num formato unico pra desenhar a lista
function itensConstrutor() {
  const carrosseis = (ESTADO.carrosseis || []).map(c => ({
    tipo: 'carrossel', id: c.id, icone: '🎠', nome: c.nome || 'Carrossel',
    posicao: c.posicao, ordem: c.ordem || 0, ativo: c.ativo
  }));
  const vitrines = (ESTADO.vitrines || []).map(v => ({
    tipo: 'vitrine', id: v.id, icone: '🖼️', nome: v.nome || 'Vitrine',
    posicao: v.posicao, ordem: v.ordem || 0, ativo: v.ativo
  }));
  const caixas = (ESTADO.caixasTexto || []).map(t => ({
    tipo: 'caixa-texto', id: t.id, icone: '📝', nome: t.titulo || 'Texto livre',
    posicao: t.posicao, ordem: t.ordem || 0, ativo: t.ativo
  }));
  return [...carrosseis, ...vitrines, ...caixas];
}

function renderizarConstrutorPagina() {
  const container = document.getElementById('construtor-lista');
  if (!container) return;

  const slots = montarSlotsConstrutor();
  const itens = itensConstrutor();

  let html = '';
  slots.forEach(slot => {
    html += `<div class="construtor-ancora" data-posicao="${slot.chave}">${escaparHtmlAdmin(slot.rotulo)}</div>`;

    itens
      .filter(item => item.posicao === slot.chave)
      .sort((a, b) => a.ordem - b.ordem)
      .forEach(item => {
        html += `
          <div class="construtor-bloco${item.ativo ? '' : ' construtor-bloco--inativo'}" data-tipo="${item.tipo}" data-id="${item.id}">
            <span class="construtor-bloco__alca">⠿</span>
            <span class="construtor-bloco__icone">${item.icone}</span>
            <span class="construtor-bloco__nome">${escaparHtmlAdmin(item.nome)}</span>
            ${item.ativo ? '' : '<span class="construtor-bloco__tag">inativo</span>'}
          </div>`;
      });
  });

  container.innerHTML = html;

  if (SORTABLE_CONSTRUTOR) {
    SORTABLE_CONSTRUTOR.destroy();
    SORTABLE_CONSTRUTOR = null;
  }
  if (typeof Sortable === 'undefined') return;

  SORTABLE_CONSTRUTOR = Sortable.create(container, {
    animation: 150,
    delay: 150,
    delayOnTouchOnly: true, // evita arrastar sem querer ao rolar a tela no celular
    filter: '.construtor-ancora',
    preventOnFilter: false,
    handle: '.construtor-bloco__alca',
    onEnd: salvarNovaOrdemConstrutor
  });
}

async function salvarNovaOrdemConstrutor() {
  const container = document.getElementById('construtor-lista');
  const filhos = Array.from(container.children);
  const itensAntes = itensConstrutor();

  let anchoraAtual = null;
  let contador = 0;
  const atualizacoes = [];

  filhos.forEach(el => {
    if (el.classList.contains('construtor-ancora')) {
      anchoraAtual = el.getAttribute('data-posicao');
      contador = 0;
      return;
    }

    const tipo = el.getAttribute('data-tipo');
    const id = el.getAttribute('data-id');
    const ordemNova = contador++;

    const original = itensAntes.find(i => i.tipo === tipo && i.id === id);
    if (original && (original.posicao !== anchoraAtual || original.ordem !== ordemNova)) {
      atualizacoes.push({ tipo, id, posicao: anchoraAtual, ordem: ordemNova });
    }
  });

  if (atualizacoes.length === 0) return;

  try {
    await Promise.all(atualizacoes.map(u => {
      if (u.tipo === 'carrossel') {
        return apiAtualizarCarrossel(u.id, { posicao: u.posicao, ordem: u.ordem });
      }
      if (u.tipo === 'caixa-texto') {
        return apiAtualizarCaixaTexto(u.id, { posicao: u.posicao, ordem: u.ordem });
      }
      // Vitrine exige FormData porque o mesmo endpoint aceita troca de imagem
      const formData = new FormData();
      formData.append('posicao', u.posicao);
      formData.append('ordem', u.ordem);
      return apiAtualizarVitrine(u.id, formData);
    }));

    atualizacoes.forEach(u => {
      const lista = u.tipo === 'carrossel' ? ESTADO.carrosseis
        : u.tipo === 'vitrine' ? ESTADO.vitrines
        : ESTADO.caixasTexto;
      const item = (lista || []).find(i => i.id === u.id);
      if (item) {
        item.posicao = u.posicao;
        item.ordem = u.ordem;
      }
    });

    mostrarToast('Ordem da página atualizada.');
  } catch (erro) {
    mostrarToast(erro.message, true);
    renderizarConstrutorPagina(); // desfaz visualmente se o salvamento falhar
  }
}
