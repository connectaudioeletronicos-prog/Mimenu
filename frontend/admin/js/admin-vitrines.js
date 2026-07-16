// ===================================================================
// Painel admin: Carrosseis extras e Vitrines
// Segue o mesmo padrao usado em promocoes (admin.js), como modulo separado.
// ===================================================================

const NOMES_POSICAO = {
  'topo': 'No topo',
  'apos-cabecalho': 'Apos o cabecalho',
  'apos-categorias': 'Apos as categorias',
  'apos-produtos': 'Apos os produtos',
  'antes-rodape': 'Antes do rodape'
};

let CARROSSEL_ABERTO_ID = null;

// ---------------------------------------------------------------
// Carrosseis extras
// ---------------------------------------------------------------
function renderizarCarrosseisAdmin() {
  const lista = document.getElementById('lista-carrosseis-admin');
  if (!lista) return;

  if (!ESTADO.carrosseis || ESTADO.carrosseis.length === 0) {
    lista.innerHTML = '<div class="lista-vazia">Nenhum carrossel extra cadastrado ainda.</div>';
    return;
  }

  lista.innerHTML = ESTADO.carrosseis.map(carrossel => `
    <div class="item-admin">
      <div class="item-admin__info">
        <strong>${escaparHtmlAdmin(carrossel.nome || 'Carrossel')}</strong>
        <span class="item-admin__detalhe">
          ${NOMES_POSICAO[carrossel.posicao] || carrossel.posicao} ·
          ${(carrossel.imagens || []).length} foto(s) ·
          ${carrossel.ativo ? '<span style="color:var(--cor-sucesso,#2a9d4f)">Ativo</span>' : 'Desativado'}
        </span>
      </div>
      <div class="item-admin__acoes">
        <button data-editar-carrossel="${carrossel.id}">Gerenciar</button>
        <button class="botao-perigo" data-excluir-carrossel="${carrossel.id}">Excluir</button>
      </div>
    </div>
  `).join('');

  lista.querySelectorAll('[data-editar-carrossel]').forEach(b => {
    b.addEventListener('click', () => abrirModalCarrossel(b.getAttribute('data-editar-carrossel')));
  });
  lista.querySelectorAll('[data-excluir-carrossel]').forEach(b => {
    b.addEventListener('click', () => excluirCarrossel(b.getAttribute('data-excluir-carrossel')));
  });
}

function configurarEventosCarrosseis() {
  if (window.EVENTOS_CARROSSEIS_CONFIGURADOS) return;
  window.EVENTOS_CARROSSEIS_CONFIGURADOS = true;

  document.getElementById('botao-novo-carrossel').addEventListener('click', () => abrirModalCarrossel(null));

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
      renderizarImagensCarrosselModal();
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
  document.getElementById('carrossel-posicao').value = carrossel?.posicao || 'apos-cabecalho';
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
  area.innerHTML = imagens.map((img, i) => `
    <div class="lista-imagens-carrossel__item">
      <img src="${img.imagem_url}" alt="">
      <div class="lista-imagens-carrossel__botoes">
        <button type="button" data-mover-imagem="${img.id}" data-direcao="-1" ${i === 0 ? 'disabled' : ''}>↑</button>
        <button type="button" data-mover-imagem="${img.id}" data-direcao="1" ${i === imagens.length - 1 ? 'disabled' : ''}>↓</button>
        <button type="button" class="botao-perigo" data-remover-imagem="${img.id}">Excluir</button>
      </div>
    </div>
  `).join('');

  area.querySelectorAll('[data-remover-imagem]').forEach(b => {
    b.addEventListener('click', () => removerImagemCarrossel(b.getAttribute('data-remover-imagem')));
  });
  area.querySelectorAll('[data-mover-imagem]').forEach(b => {
    b.addEventListener('click', () => moverImagemCarrossel(
      b.getAttribute('data-mover-imagem'),
      parseInt(b.getAttribute('data-direcao'), 10)
    ));
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

async function moverImagemCarrossel(imagemId, direcao) {
  const carrossel = ESTADO.carrosseis.find(c => c.id === CARROSSEL_ABERTO_ID);
  if (!carrossel) return;
  const imagens = carrossel.imagens.slice().sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
  const indice = imagens.findIndex(img => img.id === imagemId);
  const novoIndice = indice + direcao;
  if (novoIndice < 0 || novoIndice >= imagens.length) return;

  [imagens[indice], imagens[novoIndice]] = [imagens[novoIndice], imagens[indice]];

  try {
    await Promise.all(imagens.map((img, i) => apiAtualizarImagemCarrossel(img.id, { ordem: i })));
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
  if (!lista) return;

  if (!ESTADO.vitrines || ESTADO.vitrines.length === 0) {
    lista.innerHTML = '<div class="lista-vazia">Nenhuma vitrine cadastrada ainda.</div>';
    return;
  }

  lista.innerHTML = ESTADO.vitrines.map(vitrine => `
    <div class="item-admin">
      <img src="${vitrine.imagem_url}" alt="" style="width:44px;height:56px;object-fit:cover;border-radius:6px;margin-right:10px;">
      <div class="item-admin__info">
        <strong>${escaparHtmlAdmin((vitrine.texto || 'Sem texto').slice(0, 40))}${vitrine.texto && vitrine.texto.length > 40 ? '…' : ''}</strong>
        <span class="item-admin__detalhe">
          ${NOMES_POSICAO[vitrine.posicao] || vitrine.posicao} ·
          ${vitrine.ativo ? '<span style="color:var(--cor-sucesso,#2a9d4f)">Ativa</span>' : 'Desativada'}
        </span>
      </div>
      <div class="item-admin__acoes">
        <button data-editar-vitrine="${vitrine.id}">Editar</button>
        <button class="botao-perigo" data-excluir-vitrine="${vitrine.id}">Excluir</button>
      </div>
    </div>
  `).join('');

  lista.querySelectorAll('[data-editar-vitrine]').forEach(b => {
    b.addEventListener('click', () => abrirModalVitrine(b.getAttribute('data-editar-vitrine')));
  });
  lista.querySelectorAll('[data-excluir-vitrine]').forEach(b => {
    b.addEventListener('click', () => excluirVitrine(b.getAttribute('data-excluir-vitrine')));
  });
}

function configurarEventosVitrines() {
  if (window.EVENTOS_VITRINES_CONFIGURADOS) return;
  window.EVENTOS_VITRINES_CONFIGURADOS = true;

  document.getElementById('botao-nova-vitrine').addEventListener('click', () => abrirModalVitrine(null));

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
  document.getElementById('vitrine-texto').value = vitrine?.texto || '';
  document.getElementById('vitrine-texto-contador').textContent = `${(vitrine?.texto || '').length}/300`;
  document.getElementById('vitrine-posicao').value = vitrine?.posicao || 'apos-produtos';
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
