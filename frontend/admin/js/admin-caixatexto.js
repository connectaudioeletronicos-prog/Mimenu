// ===================================================================
// Administracao das Caixas de Texto (titulo + corpo, posicionavel)
// Mesmo padrao de admin-vitrines.js
// ===================================================================

function renderizarCaixasTextoAdmin() {
  const lista = document.getElementById('lista-caixas-texto-admin');
  if (!lista) return;

  if (!ESTADO.caixasTexto || ESTADO.caixasTexto.length === 0) {
    lista.innerHTML = '<div class="lista-vazia">Nenhuma caixa de texto cadastrada ainda.</div>';
    return;
  }

  lista.innerHTML = ESTADO.caixasTexto.map(caixa => `
    <div class="item-admin">
      <div class="item-admin__info">
        <strong>${escaparHtmlAdmin(caixa.titulo)}</strong>
        <span class="item-admin__detalhe">
          ${nomePosicaoLegivel(caixa.posicao)} ·
          ${caixa.ativo ? '<span style="color:var(--cor-sucesso,#2a9d4f)">Ativa</span>' : 'Desativada'}
        </span>
      </div>
      <div class="item-admin__acoes">
        <button data-editar-caixa-texto="${caixa.id}">Editar</button>
        <button class="botao-perigo" data-excluir-caixa-texto="${caixa.id}">Excluir</button>
      </div>
    </div>
  `).join('');

  lista.querySelectorAll('[data-editar-caixa-texto]').forEach(b => {
    b.addEventListener('click', () => abrirModalCaixaTexto(b.getAttribute('data-editar-caixa-texto')));
  });
  lista.querySelectorAll('[data-excluir-caixa-texto]').forEach(b => {
    b.addEventListener('click', () => excluirCaixaTexto(b.getAttribute('data-excluir-caixa-texto')));
  });
}

function configurarEventosCaixasTexto() {
  if (window.EVENTOS_CAIXAS_TEXTO_CONFIGURADOS) return;
  window.EVENTOS_CAIXAS_TEXTO_CONFIGURADOS = true;

  document.getElementById('botao-nova-caixa-texto').addEventListener('click', () => abrirModalCaixaTexto(null));

  const corpoCampo = document.getElementById('caixa-texto-corpo');
  const contador = document.getElementById('caixa-texto-corpo-contador');
  corpoCampo.addEventListener('input', () => {
    contador.textContent = `${corpoCampo.value.length}/600`;
  });

  document.getElementById('form-caixa-texto').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const id = document.getElementById('caixa-texto-id').value;
    const dados = {
      titulo: document.getElementById('caixa-texto-titulo').value.trim() || 'Aviso',
      corpo: document.getElementById('caixa-texto-corpo').value.trim(),
      posicao: document.getElementById('caixa-texto-posicao').value,
      ativo: document.getElementById('caixa-texto-ativo').checked
    };

    if (!dados.corpo) {
      mostrarToast('Escreva o texto da caixa.', true);
      return;
    }

    try {
      if (id) {
        await apiAtualizarCaixaTexto(id, dados);
      } else {
        await apiCriarCaixaTexto(dados);
      }
      ESTADO.caixasTexto = await apiListarCaixasTexto();
      renderizarCaixasTextoAdmin();
      document.getElementById('modal-caixa-texto').classList.add('oculto');
      mostrarToast('Caixa de texto salva com sucesso!');
    } catch (erro) {
      mostrarToast(erro.message, true);
    }
  });
}

function abrirModalCaixaTexto(id) {
  const caixa = id ? ESTADO.caixasTexto.find(c => c.id === id) : null;
  document.getElementById('titulo-modal-caixa-texto').textContent = caixa ? 'Editar caixa de texto' : 'Nova caixa de texto';
  document.getElementById('caixa-texto-id').value = id || '';
  document.getElementById('caixa-texto-titulo').value = caixa?.titulo || '';
  document.getElementById('caixa-texto-corpo').value = caixa?.corpo || '';
  document.getElementById('caixa-texto-corpo-contador').textContent = `${(caixa?.corpo || '').length}/600`;
  preencherSelectPosicao('caixa-texto-posicao', caixa?.posicao || 'apos-cabecalho');
  document.getElementById('caixa-texto-ativo').checked = !!caixa?.ativo;
  document.getElementById('modal-caixa-texto').classList.remove('oculto');
}

async function excluirCaixaTexto(id) {
  if (!confirm('Tem certeza que deseja excluir esta caixa de texto?')) return;
  try {
    await apiExcluirCaixaTexto(id);
    ESTADO.caixasTexto = await apiListarCaixasTexto();
    renderizarCaixasTextoAdmin();
    mostrarToast('Caixa de texto excluida.');
  } catch (erro) {
    mostrarToast(erro.message, true);
  }
}
