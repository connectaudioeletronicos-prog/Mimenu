(async function () {
  const parametros = new URLSearchParams(window.location.search);
  const tipo = parametros.get('tipo');
  const elementoTitulo = document.getElementById('pagina-legal-titulo');
  const elementoConteudo = document.getElementById('pagina-legal-conteudo');
  const linkVoltar = document.getElementById('pagina-legal-voltar');

  if (linkVoltar) {
    linkVoltar.href = SLUG_ESTABELECIMENTO ? `index.html?slug=${encodeURIComponent(SLUG_ESTABELECIMENTO)}` : 'index.html';
  }

  const TIPOS = {
    termos: { titulo: 'Termos de Uso', campo: 'termos_uso' },
    cookies: { titulo: 'Cookies', campo: 'cookies' },
    privacidade: { titulo: 'Politica de Privacidade', campo: 'politica_privacidade' }
  };

  const config = TIPOS[tipo];

  if (!config || !SLUG_ESTABELECIMENTO) {
    elementoTitulo.textContent = 'Documento nao encontrado';
    elementoConteudo.textContent = 'Link invalido.';
    return;
  }

  elementoTitulo.textContent = config.titulo;

  try {
    const dados = await buscarDadosEstabelecimento(SLUG_ESTABELECIMENTO);
    const texto = dados.estabelecimento[config.campo];

    if (texto && texto.trim().length > 0) {
      elementoConteudo.textContent = texto;
    } else {
      elementoConteudo.textContent = 'Este estabelecimento ainda nao cadastrou este documento.';
      elementoConteudo.classList.add('pagina-legal__vazio');
    }
  } catch (erro) {
    elementoConteudo.textContent = 'Nao foi possivel carregar este documento.';
  }
})();
