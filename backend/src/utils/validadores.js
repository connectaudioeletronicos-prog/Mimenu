// ===================================================================
// Validadores padronizados de telefone e CPF, usados em qualquer
// cadastro do sistema (funcionarios, clientes, dados legais). O
// formato de telefone e EXATAMENTE o mesmo usado no checkout do
// cliente final: "(99) 999999999" (DDD entre parenteses + 9 digitos).
// ===================================================================
const REGEX_TELEFONE = /^\(\d{2}\)\s\d{9}$/;
const REGEX_CPF = /^\d{3}\.\d{3}\.\d{3}-\d{2}$/;

// Slug: letras minusculas e numeros, hifens simples entre eles, sem
// hifen no inicio/fim, entre 3 e 60 caracteres. Ex.: "loja-teste".
const REGEX_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SLUG_TAMANHO_MIN = 3;
const SLUG_TAMANHO_MAX = 60;

// Nomes que colidem com arquivos/pastas reais publicados na raiz do
// dominio (palatos.com.br) ou que sao usados como segmento fixo de
// rota (ex.: /<slug>/admin). Se um lojista pudesse usar um desses como
// slug, o link do proprio cardapio ou do painel quebraria.
const SLUGS_RESERVADOS = [
  'admin', 'frontend', 'backend', 'database', 'api',
  'index', '404', 'cname', 'readme', 'backlog', 'favicon',
  'cliente-login', 'cliente-cadastro',
  'politica-privacidade', 'termos-servico',
  'www', 'mail', 'ftp', 'app', 'static', 'assets'
];

function validarTelefone(telefone) {
  return REGEX_TELEFONE.test((telefone || '').trim());
}

function validarCPF(cpf) {
  return REGEX_CPF.test((cpf || '').trim());
}

function validarSlug(slug) {
  const valor = (slug || '').trim();
  return (
    valor.length >= SLUG_TAMANHO_MIN &&
    valor.length <= SLUG_TAMANHO_MAX &&
    REGEX_SLUG.test(valor)
  );
}

function slugReservado(slug) {
  return SLUGS_RESERVADOS.includes((slug || '').trim().toLowerCase());
}

module.exports = {
  validarTelefone, validarCPF, REGEX_TELEFONE, REGEX_CPF,
  validarSlug, slugReservado, REGEX_SLUG, SLUGS_RESERVADOS
};
