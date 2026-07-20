// ===================================================================
// Painel admin: Carrosseis extras e Vitrines
// Segue o mesmo padrao usado em promocoes (admin.js), como modulo separado.
// ===================================================================

const NOMES_POSICAO = {
  'topo': 'No topo',
  'apos-cabecalho': 'Apos o cabecalho',
  'apos-categorias': 'Apos todas as categorias',
  'apos-produtos': 'Apos todos os produtos',
  'antes-rodape': 'Antes do rodape'
};

// Traduz qualquer posicao (fixa ou "apos-categoria:<id>") pra um texto legivel
function nomePosicaoLegivel(posicao) {
  if (NOMES_POSICAO[posicao]) return NOMES_POSICAO[posicao];
  if (posicao && posicao.startsWith('apos-categoria:')) {
    const idCategoria = posicao.split(':')[1];
    const categoria = (ESTADO.categorias || []).find(c => c.id === idCategoria);
    return categoria ? `Entre "${categoria.nome}" e a proxima categoria` : 'Categoria removida';
  }
  return posicao;
}

// Preenche um <select> de posicao com os 5 pontos fixos + uma opcao
// pra cada categoria do cardapio (pra intercalar entre categorias)
function preencherSelectPosicao(idSelect, valorAtual) {
  const select = document.getElementById(idSelect);
  if (!select) return;

  const opcoesFixas = Object.entries(NOMES_POSICAO)
    .map(([valor, rotulo]) => `<option value="${valor}">${rotulo}</option>`)
    .join('');

  const categorias = ESTADO.categorias || [];
  const opcoesCategorias = categorias.length > 0
    ? `<optgroup label="Entre categorias">
        ${categorias.map(cat => `<option value="apos-categoria:${cat.id}">Logo apos "${escaparHtmlAdmin(cat.nome)}"</option>`).join('')}
      </optgroup>`
    : '';

  select.innerHTML = opcoesFixas + opcoesCategorias;
  select.value = valorAtual || 'apos-cabecalho';
}

let CARROSSEL_ABERTO_ID = null;

// ---------------------------------------------------------------
// Carrosseis extras
// ---------------------------------------------------------------
function renderizarCarrosseisAdmin() {
  const lista = document.getElementById('lista-carrosseis-admin');
  const blocoDesativados = document.getElementById('bloco-carrosseis-desativados');
  if (!lista) return;

  const todos = ESTADO.carrosseis || [];
  const ativos = todos.filter(c => c.ativo);
  const desativados = todos.filter(c => !c.ativo);

  const contadorEl = document.getElementById('contador-carrosseis-desativados');
  if (contadorEl) contadorEl.textContent = `(${desativados.length})`;

  lista.innerHTML = ativos.length === 0
    ? '<div class="lista-vazia">Nenhum carrossel ativo.</div>'
    : montarItensCarrossel(ativos);
  configurarItensCarrossel(lista);

  if (blocoDesativados) {
    blocoDesativados.innerHTML = desativados.length === 0
      ? '<div class="lista-vazia">Nenhum carrossel desativado.</div>'
      : montarItensCarrossel(desativados);
    configurarItensCarrossel(blocoDesativados);
  }
}

function montarItensCarrossel(carrosseis) {
  return carrosseis.map(carrossel => `
    <div class="item-admin" data-carrossel-drag-id="${carrossel.id}">
      <span class="drag-handle" title="Segure e arraste para reordenar">⠿</span>
      <div class="item-admin__info">
        <strong>${escaparHtmlAdmin(carrossel.nome || 'Carrossel')}</strong>
        <span class="item-admin__detalhe">
          ${nomePosicaoLegivel(carrossel.posicao)} ·
          ${(carrossel.imagens || []).length} foto(s)
        </span>
      </div>
      <div class="item-admin__acoes">
        <button data-editar-carrossel="${carrossel.id}">Gerenciar</button>
        <label class="interruptor" title="${carrossel.ativo ? 'Desativar carrossel' : 'Ativar carrossel'}">
          <input type="checkbox" data-toggle-carrossel="${carrossel.id}" ${carrossel.ativo ? 'checked' : ''}>
          <span class="interruptor__trilho"></span>
        </label>
        <button class="botao-perigo" data-excluir-carrossel="${carrossel.id}">Excluir</button>
      </div>
    </div>
  `).join('');
}

function configurarItensCarrossel(container) {
  configurarArrastarSoltar(container, '[data-carrossel-drag-id]', 'data-carrossel-drag-id', async (novaOrdemIds) => {
    try {
      await Promise.all(novaOrdemIds.map((id, i) => apiAtualizarCarrossel(id, { ordem: i })));
      ESTADO.carrosseis = await apiListarCarrosseis();
      renderizarCarrosseisAdmin();
    } catch (erro) {
      mostrarToast(erro.message, true);
    }
  });

  container.querySelectorAll('[data-editar-carrossel]').forEach(b => {
    b.addEventListener('click', () => abrirModalCarrossel(b.getAttribute('data-editar-carrossel')));
  });
  container.querySelectorAll('[data-excluir-carrossel]').forEach(b => {
    b.addEventListener('click', () => excluirCarrossel(b.getAttribute('data-excluir-carrossel')));
  });
  container.querySelectorAll('[data-toggle-carrossel]').forEach(input => {
    input.addEventListener('change', () => alternarAtivoCarrossel(input.getAttribute('data-toggle-carrossel'), input.checked));
  });
}

async function alternarAtivoCarrossel(id, ativo) {
  try {
    await apiAtualizarCarrossel(id, { ativo });
    ESTADO.carrosseis = await apiListarCarrosseis();
    renderizarCarrosseisAdmin();
    mostrarToast(ativo ? 'Carrossel ativado.' : 'Carrossel desativado.');
  } catch (erro) {
    mostrarToast(erro.message, true);
    renderizarCarrosseisAdmin();
  }
}

function configurarEventosCarrosseis() {
  if (window.EVENTOS_CARROSSEIS_CONFIGURADOS) return;
  window.EVENTOS_CARROSSEIS_CONFIGURADOS = true;

  document.getElementById('botao-novo-carrossel').addEventListener('click', () => abrirModalCarrossel(null));
  document.getElementById('botao-alternar-carrosseis-desativados')?.addEventListener('click', () => {
    document.getElementById('bloco-carrosseis-desativados').classList.toggle('oculto');
  });

  document.getElementById('form-carrossel').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const id = document.getElementById('carrossel-id').value;
    const dados = {
      nome: document.getElementById('carrossel-nome').value.trim() || 'Carrossel',
      posicao: document.getElementById('carrossel-posicao').value,
      ativo: document.getElementById('carrossel-ativo').checked
    };
    try {
      if (id) {
        await apiAtualizarCarrossel(id, dados);
      } else {
        const criado = await apiCriarCarrossel(dados);
        document.getElementById('carrossel-id').value = criado.id;
        CARROSSEL_ABERTO_ID = criado.id;
      }
      ESTADO.carrosseis = await apiListarCarrosseis();
      renderizarCarrosseisAdmin();
      mostrarToast('Carrossel salvo com sucesso!');
      if (id) {
        document.getElementById('modal-carrossel').classList.add('oculto');
      } else {
        // Carrossel recem-criado: mantem o modal aberto pra permitir
        // adicionar as fotos na hora, sem precisar reabrir "Gerenciar".
        renderizarImagensCarrosselModal();
      }
    } catch (erro) {
      mostrarToast(erro.message, true);
    }
  });

  document.getElementById('input-nova-imagem-carrossel').addEventListener('change', async (evento) => {
    const arquivo = evento.target.files[0];
    if (!arquivo || !CARROSSEL_ABERTO_ID) return;
    try {
      const formData = new FormData();
      formData.append('imagem', arquivo);
      await apiAdicionarImagemCarrossel(CARROSSEL_ABERTO_ID, formData);
      ESTADO.carrosseis = await apiListarCarrosseis();
      renderizarCarrosseisAdmin();
      renderizarImagensCarrosselModal();
      mostrarToast('Foto adicionada!');
    } catch (erro) {
      mostrarToast(erro.message, true);
    } finally {
      evento.target.value = '';
    }
  });
}

function abrirModalCarrossel(id) {
  const carrossel = id ? ESTADO.carrosseis.find(c => c.id === id) : null;
  CARROSSEL_ABERTO_ID = id || null;
  document.getElementById('titulo-modal-carrossel').textContent = carrossel ? 'Gerenciar carrossel' : 'Novo carrossel';
  document.getElementById('carrossel-id').value = id || '';
  document.getElementById('carrossel-nome').value = carrossel?.nome || '';
  preencherSelectPosicao('carrossel-posicao', carrossel?.posicao || 'apos-cabecalho');
  document.getElementById('carrossel-ativo').checked = !!carrossel?.ativo;
  renderizarImagensCarrosselModal();
  document.getElementById('modal-carrossel').classList.remove('oculto');
}

function renderizarImagensCarrosselModal() {
  const area = document.getElementById('lista-imagens-carrossel');
  if (!area) return;
  if (!CARROSSEL_ABERTO_ID) {
    area.innerHTML = '<p class="campo-dica">Salve o carrossel primeiro para poder adicionar fotos.</p>';
    return;
  }
  const carrossel = ESTADO.carrosseis.find(c => c.id === CARROSSEL_ABERTO_ID);
  const imagens = (carrossel?.imagens || []).slice().sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
  if (imagens.length === 0) {
    area.innerHTML = '<p class="campo-dica">Nenhuma foto ainda. Adicione quantas quiser abaixo.</p>';
    return;
  }
  area.innerHTML = imagens.map((img) => `
    <div class="lista-imagens-carrossel__item" data-imagem-id="${img.id}">
      <span class="drag-handle" title="Segure e arraste para reordenar">⠿</span>
      <img src="${img.imagem_url}" alt="">
      <div class="lista-imagens-carrossel__botoes">
        <button type="button" class="botao-perigo" data-remover-imagem="${img.id}">Excluir</button>
      </div>
    </div>
  `).join('');

  area.querySelectorAll('[data-remover-imagem]').forEach(b => {
    b.addEventListener('click', () => removerImagemCarrossel(b.getAttribute('data-remover-imagem')));
  });

  configurarArrastarSoltar(area, '.lista-imagens-carrossel__item', 'data-imagem-id', async (novaOrdemIds) => {
    try {
      await Promise.all(novaOrdemIds.map((id, i) => apiAtualizarImagemCarrossel(id, { ordem: i })));
      ESTADO.carrosseis = await apiListarCarrosseis();
      renderizarCarrosseisAdmin();
      renderizarImagensCarrosselModal();
    } catch (erro) {
      mostrarToast(erro.message, true);
    }
  });
}

async function removerImagemCarrossel(imagemId) {
  if (!confirm('Excluir esta foto do carrossel?')) return;
  try {
    await apiRemoverImagemCarrossel(imagemId);
    ESTADO.carrosseis = await apiListarCarrosseis();
    renderizarCarrosseisAdmin();
    renderizarImagensCarrosselModal();
  } catch (erro) {
    mostrarToast(erro.message, true);
  }
}

async function excluirCarrossel(id) {
  if (!confirm('Tem certeza que deseja excluir este carrossel e todas as suas fotos?')) return;
  try {
    await apiExcluirCarrossel(id);
    ESTADO.carrosseis = await apiListarCarrosseis();
    renderizarCarrosseisAdmin();
    mostrarToast('Carrossel excluido.');
  } catch (erro) {
    mostrarToast(erro.message, true);
  }
}

// ---------------------------------------------------------------
// Vitrines
// ---------------------------------------------------------------
function renderizarVitrinesAdmin() {
  const lista = document.getElementById('lista-vitrines-admin');
  const blocoDesativadas = document.getElementById('bloco-vitrines-desativadas');
  if (!lista) return;

  const todas = ESTADO.vitrines || [];
  const ativas = todas.filter(v => v.ativo);
  const desativadas = todas.filter(v => !v.ativo);

  const contadorEl = document.getElementById('contador-vitrines-desativadas');
  if (contadorEl) contadorEl.textContent = `(${desativadas.length})`;

  lista.innerHTML = ativas.length === 0
    ? '<div class="lista-vazia">Nenhuma vitrine ativa.</div>'
    : montarItensVitrine(ativas);
  configurarItensVitrine(lista);

  if (blocoDesativadas) {
    blocoDesativadas.innerHTML = desativadas.length === 0
      ? '<div class="lista-vazia">Nenhuma vitrine desativada.</div>'
      : montarItensVitrine(desativadas);
    configurarItensVitrine(blocoDesativadas);
  }
}

function montarItensVitrine(vitrines) {
  return vitrines.map(vitrine => `
    <div class="item-admin" data-vitrine-drag-id="${vitrine.id}">
      <span class="drag-handle" title="Segure e arraste para reordenar">⠿</span>
      <img src="${vitrine.imagem_url}" alt="" style="width:44px;height:56px;object-fit:cover;border-radius:6px;margin-right:10px;">
      <div class="item-admin__info">
        <strong>${escaparHtmlAdmin(vitrine.nome || 'Vitrine')}</strong>
        <span class="item-admin__detalhe">${nomePosicaoLegivel(vitrine.posicao)}</span>
      </div>
      <div class="item-admin__acoes">
        <button data-editar-vitrine="${vitrine.id}">Editar</button>
        <label class="interruptor" title="${vitrine.ativo ? 'Desativar vitrine' : 'Ativar vitrine'}">
          <input type="checkbox" data-toggle-vitrine="${vitrine.id}" ${vitrine.ativo ? 'checked' : ''}>
          <span class="interruptor__trilho"></span>
        </label>
        <button class="botao-perigo" data-excluir-vitrine="${vitrine.id}">Excluir</button>
      </div>
    </div>
  `).join('');
}

function configurarItensVitrine(container) {
  configurarArrastarSoltar(container, '[data-vitrine-drag-id]', 'data-vitrine-drag-id', async (novaOrdemIds) => {
    try {
      await Promise.all(novaOrdemIds.map((id, i) => {
        const fd = new FormData();
        fd.append('ordem', i);
        return apiAtualizarVitrine(id, fd);
      }));
      ESTADO.vitrines = await apiListarVitrines();
      renderizarVitrinesAdmin();
      mostrarToast('Ordem salva com sucesso!');
    } catch (erro) {
      mostrarToast(erro.message, true);
    }
  });

  container.querySelectorAll('[data-editar-vitrine]').forEach(b => {
    b.addEventListener('click', () => abrirModalVitrine(b.getAttribute('data-editar-vitrine')));
  });
  container.querySelectorAll('[data-excluir-vitrine]').forEach(b => {
    b.addEventListener('click', () => excluirVitrine(b.getAttribute('data-excluir-vitrine')));
  });
  container.querySelectorAll('[data-toggle-vitrine]').forEach(input => {
    input.addEventListener('change', () => alternarAtivoVitrine(input.getAttribute('data-toggle-vitrine'), input.checked));
  });
}

async function alternarAtivoVitrine(id, ativo) {
  try {
    const fd = new FormData();
    fd.append('ativo', ativo);
    await apiAtualizarVitrine(id, fd);
    ESTADO.vitrines = await apiListarVitrines();
    renderizarVitrinesAdmin();
    mostrarToast(ativo ? 'Vitrine ativada.' : 'Vitrine desativada.');
  } catch (erro) {
    mostrarToast(erro.message, true);
    renderizarVitrinesAdmin();
  }
}

function configurarEventosVitrines() {
  if (window.EVENTOS_VITRINES_CONFIGURADOS) return;
  window.EVENTOS_VITRINES_CONFIGURADOS = true;

  document.getElementById('botao-nova-vitrine').addEventListener('click', () => abrirModalVitrine(null));
  document.getElementById('botao-alternar-vitrines-desativadas')?.addEventListener('click', () => {
    document.getElementById('bloco-vitrines-desativadas').classList.toggle('oculto');
  });

  const textoCampo = document.getElementById('vitrine-texto');
  const contador = document.getElementById('vitrine-texto-contador');
  textoCampo.addEventListener('input', () => {
    contador.textContent = `${textoCampo.value.length}/300`;
  });

  document.getElementById('vitrine-imagem').addEventListener('change', (evento) => {
    const arquivo = evento.target.files[0];
    if (!arquivo) return;
    document.getElementById('preview-vitrine-imagem').src = URL.createObjectURL(arquivo);
  });

  document.getElementById('form-vitrine').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const id = document.getElementById('vitrine-id').value;
    const formData = new FormData();
    formData.append('nome', document.getElementById('vitrine-nome').value.trim() || 'Vitrine');
    formData.append('texto', document.getElementById('vitrine-texto').value.trim());
    formData.append('posicao', document.getElementById('vitrine-posicao').value);
    formData.append('ativo', document.getElementById('vitrine-ativo').checked);
    const arquivo = document.getElementById('vitrine-imagem').files[0];
    if (arquivo) formData.append('imagem', arquivo);

    if (!id && !arquivo) {
      mostrarToast('Escolha uma imagem para a vitrine.', true);
      return;
    }

    try {
      if (id) {
        await apiAtualizarVitrine(id, formData);
      } else {
        await apiCriarVitrine(formData);
      }
      ESTADO.vitrines = await apiListarVitrines();
      renderizarVitrinesAdmin();
      document.getElementById('modal-vitrine').classList.add('oculto');
      mostrarToast('Vitrine salva com sucesso!');
    } catch (erro) {
      mostrarToast(erro.message, true);
    }
  });
}

function abrirModalVitrine(id) {
  const vitrine = id ? ESTADO.vitrines.find(v => v.id === id) : null;
  document.getElementById('titulo-modal-vitrine').textContent = vitrine ? 'Editar vitrine' : 'Nova vitrine';
  document.getElementById('vitrine-id').value = id || '';
  document.getElementById('vitrine-nome').value = vitrine?.nome || '';
  document.getElementById('vitrine-texto').value = vitrine?.texto || '';
  document.getElementById('vitrine-texto-contador').textContent = `${(vitrine?.texto || '').length}/300`;
  preencherSelectPosicao('vitrine-posicao', vitrine?.posicao || 'apos-produtos');
  document.getElementById('vitrine-ativo').checked = !!vitrine?.ativo;
  document.getElementById('vitrine-imagem').value = '';
  document.getElementById('preview-vitrine-imagem').src = vitrine?.imagem_url || '';
  document.getElementById('modal-vitrine').classList.remove('oculto');
}

async function excluirVitrine(id) {
  if (!confirm('Tem certeza que deseja excluir esta vitrine?')) return;
  try {
    await apiExcluirVitrine(id);
    ESTADO.vitrines = await apiListarVitrines();
    renderizarVitrinesAdmin();
    mostrarToast('Vitrine excluida.');
  } catch (erro) {
    mostrarToast(erro.message, true);
  }
}
