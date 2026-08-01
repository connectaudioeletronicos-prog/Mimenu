// ===================================================================
// CONTROLE DE ESTOQUE - logica de tela
// Caminho no projeto: frontend/admin/js/admin-estoque.js
// Depende de funcoes globais ja existentes em admin.js/admin-api.js:
// chamarApiAdmin (via os helpers apiEstoque*), mostrarToast, ESTADO,
// temPermissao.
// ===================================================================

let ESTOQUE_DESBLOQUEADO = false; // reseta a cada carregamento de pagina
let ESTOQUE_FORNECEDORES_CACHE = [];
let ESTOQUE_PRODUTOS_CACHE = [];

function formatarMoeda(valor) {
  return (Number(valor) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatarDataHora(iso) {
  if (!iso) return '';
  const data = new Date(iso);
  return data.toLocaleDateString('pt-BR') + ' ' + data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function rotuloCanal(canal) {
  return { delivery: 'Delivery', retirada: 'Retirada', balcao: 'Balcão', mesa: 'Mesa' }[canal] || canal || '-';
}

// ---------- Entrada na aba (com ou sem senha) ----------

function configurarEntradaEstoque() {
  const botaoMenu = document.getElementById('menu-item-estoque');
  if (!botaoMenu) return;

  botaoMenu.addEventListener('click', async () => {
    const precisaSenha = ESTADO.estabelecimento && ESTADO.estabelecimento.estoque_senha_protegida;
    const bloqueio = document.getElementById('estoque-bloqueado');
    const conteudo = document.getElementById('estoque-conteudo');

    if (precisaSenha && !ESTOQUE_DESBLOQUEADO) {
      bloqueio.classList.remove('oculto');
      conteudo.classList.add('oculto');
      document.getElementById('estoque-senha-input').value = '';
      document.getElementById('estoque-senha-erro').classList.add('oculto');
    } else {
      bloqueio.classList.add('oculto');
      conteudo.classList.remove('oculto');
      await carregarTudoEstoque();
    }
  });

  document.getElementById('estoque-senha-confirmar')?.addEventListener('click', async () => {
    const senha = document.getElementById('estoque-senha-input').value;
    const erro = document.getElementById('estoque-senha-erro');
    if (!senha) return;
    try {
      const resultado = await apiEstoqueVerificarSenha(senha);
      if (resultado.valido) {
        ESTOQUE_DESBLOQUEADO = true;
        document.getElementById('estoque-bloqueado').classList.add('oculto');
        document.getElementById('estoque-conteudo').classList.remove('oculto');
        await carregarTudoEstoque();
      }
    } catch (e) {
      erro.textContent = e.message || 'Senha incorreta.';
      erro.classList.remove('oculto');
    }
  });
}

// ---------- Carregamento e renderizacao ----------

async function carregarTudoEstoque() {
  await Promise.all([
    carregarIndicadoresEstoque(),
    carregarProdutosEstoque(),
    carregarFornecedoresEstoque(),
    carregarMovimentacoesEstoque(),
    carregarNotificacoesEstoque()
  ]);
}

async function carregarIndicadoresEstoque() {
  try {
    const dados = await apiEstoqueIndicadores();
    document.getElementById('ind-valor-total').textContent = formatarMoeda(dados.valor_total_estoque);
    document.getElementById('ind-lucro-estimado').textContent = formatarMoeda(dados.lucro_estimado_estoque);
    document.getElementById('ind-baixo-estoque').textContent = dados.produtos_baixo_estoque;
    document.getElementById('ind-esgotados').textContent = dados.produtos_esgotados;
  } catch (e) {
    mostrarToast(e.message, true);
  }
}

async function carregarProdutosEstoque() {
  try {
    const produtos = await apiEstoqueListarProdutos();
    ESTOQUE_PRODUTOS_CACHE = produtos;

    const corpo = document.getElementById('estoque-tabela-corpo');
    corpo.innerHTML = produtos.length ? '' : '<tr><td colspan="8" class="lista-vazia">Nenhum produto com controle de estoque ativado ainda. Ative em "Produtos".</td></tr>';

    produtos.forEach(p => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${p.nome}</td>
        <td>${p.codigo || '-'}</td>
        <td>${p.estoque}</td>
        <td>${p.estoque_minimo}</td>
        <td>${formatarMoeda(p.custo_compra)}</td>
        <td>${formatarMoeda(p.valor_total)}</td>
        <td><span class="estoque-status estoque-status--${p.status}">${{ normal: 'Normal', atencao: 'Atenção', esgotado: 'Esgotado' }[p.status]}</span></td>
        <td><button class="tabela-estoque__acao" data-ajustar-produto="${p.id}">Ajustar</button></td>
      `;
      corpo.appendChild(tr);
    });

    corpo.querySelectorAll('[data-ajustar-produto]').forEach(botao => {
      botao.addEventListener('click', () => abrirModalAjuste(botao.getAttribute('data-ajustar-produto')));
    });

    renderizarAlertasEstoque(produtos);
    preencherSelectProdutos(produtos);
  } catch (e) {
    mostrarToast(e.message, true);
  }
}

function renderizarAlertasEstoque(produtos) {
  const lista = document.getElementById('estoque-lista-alertas');
  const semAlertas = document.getElementById('estoque-sem-alertas');
  const emAlerta = produtos.filter(p => p.status !== 'normal');

  lista.innerHTML = '';
  semAlertas.classList.toggle('oculto', emAlerta.length > 0);

  emAlerta.forEach(p => {
    const div = document.createElement('div');
    div.className = `estoque-alerta-item estoque-alerta-item--${p.status}`;
    div.innerHTML = `
      <span class="estoque-alerta-item__icone">${p.status === 'esgotado' ? '⛔' : '⚠️'}</span>
      <div>
        <div class="estoque-alerta-item__nome">${p.nome}</div>
        <div class="estoque-alerta-item__detalhe">${p.status === 'esgotado' ? 'Esgotado' : `Restam ${p.estoque} unidades`} · Mínimo: ${p.estoque_minimo}</div>
      </div>
    `;
    lista.appendChild(div);
  });
}

async function carregarFornecedoresEstoque() {
  try {
    const fornecedores = await apiFornecedoresListar();
    ESTOQUE_FORNECEDORES_CACHE = fornecedores;

    const lista = document.getElementById('estoque-lista-fornecedores');
    lista.innerHTML = fornecedores.length ? '' : '<p class="lista-vazia">Nenhum fornecedor cadastrado.</p>';

    fornecedores.forEach(f => {
      const div = document.createElement('div');
      div.className = 'item-admin';
      div.innerHTML = `
        <div>
          <strong>${f.nome}</strong>
          <div class="estoque-alerta-item__detalhe">${f.telefone || ''} ${f.email ? '· ' + f.email : ''}</div>
        </div>
        <div>
          <button class="tabela-estoque__acao" data-editar-fornecedor="${f.id}">Editar</button>
          <button class="tabela-estoque__acao" data-excluir-fornecedor="${f.id}">Excluir</button>
        </div>
      `;
      lista.appendChild(div);
    });

    lista.querySelectorAll('[data-editar-fornecedor]').forEach(b => b.addEventListener('click', () => abrirModalFornecedor(b.getAttribute('data-editar-fornecedor'))));
    lista.querySelectorAll('[data-excluir-fornecedor]').forEach(b => b.addEventListener('click', () => excluirFornecedor(b.getAttribute('data-excluir-fornecedor'))));

    preencherSelectFornecedores(fornecedores);
  } catch (e) {
    mostrarToast(e.message, true);
  }
}

async function carregarMovimentacoesEstoque() {
  try {
    const movimentacoes = await apiEstoqueMovimentacoes();
    const lista = document.getElementById('estoque-lista-movimentacoes');
    lista.innerHTML = movimentacoes.length ? '' : '<p class="lista-vazia">Nenhuma movimentação ainda.</p>';

    const tagPorTipo = { entrada: 'entrada', saida: 'saida', ajuste: 'ajuste' };
    const rotuloPorMotivo = { venda: 'Venda', compra: 'Compra', ajuste_manual: 'Ajuste', cancelamento: 'Cancelamento' };

    movimentacoes.forEach(m => {
      const div = document.createElement('div');
      div.className = 'estoque-mov-item';
      div.innerHTML = `
        <div>
          <span class="estoque-mov-item__tag estoque-mov-item__tag--${tagPorTipo[m.tipo] || 'ajuste'}">${rotuloPorMotivo[m.motivo] || m.motivo}</span>
          <strong style="margin-left:6px;">${m.produto_nome || '—'}</strong>
          <div class="estoque-alerta-item__detalhe">${m.tipo === 'saida' ? '-' : '+'}${m.quantidade} un. ${m.canal_venda ? '· ' + rotuloCanal(m.canal_venda) : ''} ${m.funcionario_nome ? '· ' + m.funcionario_nome : ''}</div>
        </div>
        <div class="estoque-mov-item__data">${formatarDataHora(m.criado_em)}</div>
      `;
      lista.appendChild(div);
    });
  } catch (e) {
    mostrarToast(e.message, true);
  }
}

async function carregarNotificacoesEstoque() {
  try {
    const notificacoes = await apiEstoqueNotificacoes();
    const lista = document.getElementById('estoque-lista-notificacoes');
    lista.innerHTML = notificacoes.length ? '' : '<p class="lista-vazia">Nenhuma notificação enviada ainda.</p>';

    notificacoes.forEach(n => {
      const div = document.createElement('div');
      div.className = 'estoque-mov-item';
      div.innerHTML = `
        <div>
          <span class="estoque-mov-item__tag estoque-mov-item__tag--${n.canal === 'email' ? 'entrada' : 'ajuste'}">${n.canal === 'email' ? 'E-mail' : 'Dashboard'}</span>
          <div class="estoque-alerta-item__detalhe" style="margin-top:4px;">${n.mensagem}</div>
        </div>
        <div class="estoque-mov-item__data">${formatarDataHora(n.criado_em)}</div>
      `;
      lista.appendChild(div);
    });
  } catch (e) {
    mostrarToast(e.message, true);
  }
}

// ---------- Selects auxiliares (produto / fornecedor) ----------

function preencherSelectProdutos(produtos) {
  const select = document.getElementById('estoque-compra-produto');
  const selectAjuste = document.getElementById('estoque-ajuste-produto');
  [select].forEach(s => {
    if (!s) return;
    s.innerHTML = produtos.map(p => `<option value="${p.id}">${p.nome}</option>`).join('');
  });
}

function preencherSelectFornecedores(fornecedores) {
  const select = document.getElementById('estoque-compra-fornecedor');
  if (!select) return;
  select.innerHTML = '<option value="">Sem fornecedor</option>' + fornecedores.map(f => `<option value="${f.id}">${f.nome}</option>`).join('');
}

// Usada pelo modal de Produto (admin.js) para popular o select de
// fornecedor ao abrir "Novo produto" / "Editar produto". Busca a lista
// mais recente de fornecedores mesmo se a tela de Estoque nunca foi aberta.
async function preencherSelectFornecedorProduto(fornecedorIdSelecionado = '') {
  const select = document.getElementById('produto-fornecedor');
  if (!select) return;
  try {
    const fornecedores = ESTOQUE_FORNECEDORES_CACHE.length ? ESTOQUE_FORNECEDORES_CACHE : await apiFornecedoresListar();
    ESTOQUE_FORNECEDORES_CACHE = fornecedores;
    select.innerHTML = '<option value="">Sem fornecedor</option>' + fornecedores.map(f => `<option value="${f.id}">${f.nome}</option>`).join('');
    select.value = fornecedorIdSelecionado || '';
  } catch (e) {
    select.innerHTML = '<option value="">Sem fornecedor</option>';
  }
}

// ---------- Modal: registrar compra ----------

function abrirModalCompra() {
  document.getElementById('estoque-compra-quantidade').value = '';
  document.getElementById('estoque-compra-custo').value = '';
  document.getElementById('estoque-compra-observacoes').value = '';
  document.getElementById('modal-estoque-compra').classList.remove('oculto');
}

async function confirmarCompra() {
  const produto_id = document.getElementById('estoque-compra-produto').value;
  const quantidade = document.getElementById('estoque-compra-quantidade').value;
  const custo_compra = document.getElementById('estoque-compra-custo').value;
  const fornecedor_id = document.getElementById('estoque-compra-fornecedor').value;
  const observacoes = document.getElementById('estoque-compra-observacoes').value;

  try {
    await apiEstoqueRegistrarCompra({ produto_id, quantidade, custo_compra, fornecedor_id, observacoes });
    mostrarToast('Compra registrada com sucesso.');
    document.getElementById('modal-estoque-compra').classList.add('oculto');
    await carregarTudoEstoque();
  } catch (e) {
    mostrarToast(e.message, true);
  }
}

// ---------- Modal: ajuste manual ----------

function abrirModalAjuste(produtoId) {
  const produto = ESTOQUE_PRODUTOS_CACHE.find(p => p.id === produtoId);
  if (!produto) return;
  document.getElementById('estoque-ajuste-produto-nome').textContent = produto.nome;
  document.getElementById('estoque-ajuste-produto').value = produtoId;
  document.getElementById('estoque-ajuste-novo-estoque').value = produto.estoque;
  document.getElementById('estoque-ajuste-observacoes').value = '';
  document.getElementById('modal-estoque-ajuste').classList.remove('oculto');
}

async function confirmarAjuste() {
  const produto_id = document.getElementById('estoque-ajuste-produto').value;
  const novo_estoque = document.getElementById('estoque-ajuste-novo-estoque').value;
  const observacoes = document.getElementById('estoque-ajuste-observacoes').value;

  try {
    await apiEstoqueAjustarManual({ produto_id, novo_estoque, observacoes });
    mostrarToast('Estoque ajustado com sucesso.');
    document.getElementById('modal-estoque-ajuste').classList.add('oculto');
    await carregarTudoEstoque();
  } catch (e) {
    mostrarToast(e.message, true);
  }
}

// ---------- Modal: configurar alertas ----------

async function abrirModalAlertas() {
  try {
    const config = await apiEstoqueConfig();
    document.getElementById('estoque-alerta-dashboard').checked = !!config.estoque_alerta_dashboard_ativo;
    document.getElementById('estoque-alerta-email').checked = !!config.estoque_alerta_email_ativo;
    document.getElementById('estoque-alerta-email-destino').value = config.estoque_alerta_email_destino || '';
    document.getElementById('modal-estoque-alertas').classList.remove('oculto');
  } catch (e) {
    mostrarToast(e.message, true);
  }
}

async function salvarAlertas() {
  const estoque_alerta_dashboard_ativo = document.getElementById('estoque-alerta-dashboard').checked;
  const estoque_alerta_email_ativo = document.getElementById('estoque-alerta-email').checked;
  const estoque_alerta_email_destino = document.getElementById('estoque-alerta-email-destino').value.trim();

  try {
    await apiEstoqueAtualizarAlertas({ estoque_alerta_dashboard_ativo, estoque_alerta_email_ativo, estoque_alerta_email_destino });
    mostrarToast('Configuração de alertas salva.');
    document.getElementById('modal-estoque-alertas').classList.add('oculto');
  } catch (e) {
    mostrarToast(e.message, true);
  }
}

// ---------- Modal: fornecedor (criar/editar) ----------

let ESTOQUE_FORNECEDOR_EDITANDO = null;

function abrirModalFornecedor(fornecedorId = null) {
  ESTOQUE_FORNECEDOR_EDITANDO = fornecedorId;
  const fornecedor = fornecedorId ? ESTOQUE_FORNECEDORES_CACHE.find(f => f.id === fornecedorId) : null;

  document.getElementById('estoque-fornecedor-nome').value = fornecedor ? fornecedor.nome : '';
  document.getElementById('estoque-fornecedor-telefone').value = fornecedor ? (fornecedor.telefone || '') : '';
  document.getElementById('estoque-fornecedor-email').value = fornecedor ? (fornecedor.email || '') : '';
  document.getElementById('estoque-fornecedor-observacoes').value = fornecedor ? (fornecedor.observacoes || '') : '';
  document.getElementById('modal-estoque-fornecedor-titulo').textContent = fornecedorId ? 'Editar fornecedor' : 'Novo fornecedor';
  document.getElementById('modal-estoque-fornecedor').classList.remove('oculto');
}

async function salvarFornecedor() {
  const dados = {
    nome: document.getElementById('estoque-fornecedor-nome').value.trim(),
    telefone: document.getElementById('estoque-fornecedor-telefone').value.trim(),
    email: document.getElementById('estoque-fornecedor-email').value.trim(),
    observacoes: document.getElementById('estoque-fornecedor-observacoes').value.trim()
  };

  if (!dados.nome) return mostrarToast('Informe o nome do fornecedor.', true);

  try {
    if (ESTOQUE_FORNECEDOR_EDITANDO) {
      await apiFornecedoresAtualizar(ESTOQUE_FORNECEDOR_EDITANDO, dados);
    } else {
      await apiFornecedoresCriar(dados);
    }
    mostrarToast('Fornecedor salvo com sucesso.');
    document.getElementById('modal-estoque-fornecedor').classList.add('oculto');
    await carregarFornecedoresEstoque();
  } catch (e) {
    mostrarToast(e.message, true);
  }
}

async function excluirFornecedor(id) {
  if (!confirm('Remover este fornecedor?')) return;
  try {
    await apiFornecedoresExcluir(id);
    mostrarToast('Fornecedor removido.');
    await carregarFornecedoresEstoque();
  } catch (e) {
    mostrarToast(e.message, true);
  }
}

// ---------- Configuracoes: ativar modulo / senha ----------

function configurarToggleModuloEstoque() {
  const checkboxModulo = document.getElementById('config-estoque-modulo-ativo');
  const checkboxSenha = document.getElementById('config-estoque-senha-protegida');
  if (!checkboxModulo) return;

  checkboxModulo.checked = !!(ESTADO.estabelecimento && ESTADO.estabelecimento.estoque_modulo_ativo);
  if (checkboxSenha) checkboxSenha.checked = !!(ESTADO.estabelecimento && ESTADO.estabelecimento.estoque_senha_protegida);

  checkboxModulo.addEventListener('change', async () => {
    try {
      await apiEstoqueAlternarModulo(checkboxModulo.checked);
      ESTADO.estabelecimento.estoque_modulo_ativo = checkboxModulo.checked;
      document.getElementById('menu-item-estoque')?.classList.toggle('oculto', !checkboxModulo.checked);
      mostrarToast(checkboxModulo.checked ? 'Controle de estoque ativado.' : 'Controle de estoque desativado.');
    } catch (e) {
      checkboxModulo.checked = !checkboxModulo.checked;
      mostrarToast(e.message, true);
    }
  });

  checkboxSenha?.addEventListener('change', async () => {
    const senha = prompt('Confirme sua senha de acesso para alterar essa configuração:');
    if (!senha) { checkboxSenha.checked = !checkboxSenha.checked; return; }
    try {
      await apiEstoqueAlternarSenha(checkboxSenha.checked, senha);
      ESTADO.estabelecimento.estoque_senha_protegida = checkboxSenha.checked;
      mostrarToast(checkboxSenha.checked ? 'Proteção por senha ativada.' : 'Proteção por senha desativada.');
    } catch (e) {
      checkboxSenha.checked = !checkboxSenha.checked;
      mostrarToast(e.message, true);
    }
  });
}

// ---------- Inicializacao ----------

function inicializarEstoque() {
  configurarEntradaEstoque();
  configurarToggleModuloEstoque();

  document.getElementById('botao-registrar-compra')?.addEventListener('click', abrirModalCompra);
  document.getElementById('estoque-compra-confirmar')?.addEventListener('click', confirmarCompra);
  document.getElementById('estoque-ajuste-confirmar')?.addEventListener('click', confirmarAjuste);

  document.getElementById('botao-config-alertas')?.addEventListener('click', abrirModalAlertas);
  document.getElementById('estoque-alertas-salvar')?.addEventListener('click', salvarAlertas);

  document.getElementById('botao-novo-fornecedor')?.addEventListener('click', () => abrirModalFornecedor(null));
  document.getElementById('estoque-fornecedor-salvar')?.addEventListener('click', salvarFornecedor);

  // Mostra o item de menu se o modulo ja estiver ativo (a checagem de
  // permissao/visibilidade geral do menu ja acontece em admin.js).
  const moduloAtivo = ESTADO.estabelecimento && ESTADO.estabelecimento.estoque_modulo_ativo;
  document.getElementById('menu-item-estoque')?.classList.toggle('oculto', !moduloAtivo);
}

document.addEventListener('DOMContentLoaded', () => {
  // Espera o restante do admin.js autenticar e popular ESTADO antes de
  // religar os botoes -- reusa o mesmo padrao de outros modulos (vitrines,
  // construtor), chamando a inicializacao logo apos o DOM estar pronto,
  // ja que os listeners nao dependem de ESTADO estar populado ainda.
  inicializarEstoque();
});
