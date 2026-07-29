// ===================================================================
// DESTINO: backend/src/middlewares/auth.js  (SUBSTITUI o arquivo atual)
// ===================================================================
// Middleware unico de autenticacao/autorizacao. Antes existiam dois
// arquivos quase identicos (auth.js e autorizacao.js) -- um usado por
// admin.js/auth.js e outro por funcionarios.js. Qualquer correcao feita
// num so lugar. Agora e um unico arquivo, usado por todas as rotas.
// ===================================================================
const jwt = require('jsonwebtoken');
const { query } = require('../config/database');

// Autentica dono da loja OU funcionario, a partir do token JWT.
async function autenticar(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ erro: 'Token de autenticacao nao fornecido.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const funcionarioId = payload.funcionarioId || null;

    // Se o token pertence a um funcionario (nao ao dono da loja), busca no
    // banco o estado ATUAL dele -- ativo, cargo e permissoes -- em vez de
    // confiar no que ficou gravado no token no momento do login. Isso garante
    // que excluir, desativar ou apenas mudar as permissoes de um funcionario
    // tem efeito imediato na proxima requisicao, mesmo que ele ja esteja
    // logado com um token antigo e ainda valido.
    if (funcionarioId) {
      const resultado = await query('SELECT ativo, cargo, permissoes FROM funcionarios WHERE id = $1', [funcionarioId]);
      if (resultado.rows.length === 0 || !resultado.rows[0].ativo) {
        return res.status(401).json({ erro: 'Seu acesso foi revogado. Faca login novamente.' });
      }
      req.estabelecimentoId = payload.estabelecimentoId;
      req.slug = payload.slug;
      req.cargo = resultado.rows[0].cargo;
      req.funcionarioId = funcionarioId;
      req.permissoes = resultado.rows[0].permissoes || [];
      return next();
    }

    req.estabelecimentoId = payload.estabelecimentoId;
    req.slug = payload.slug;
    req.cargo = payload.cargo || 'proprietario';
    req.funcionarioId = null;
    req.permissoes = payload.permissoes || [];
    next();
  } catch (error) {
    return res.status(401).json({ erro: 'Token invalido ou expirado.' });
  }
}

function garantirProprioEstabelecimento(req, res, next) {
  const idDaRota = req.params.estabelecimentoId;
  if (idDaRota && idDaRota !== req.estabelecimentoId) {
    return res.status(403).json({ erro: 'Acesso negado a dados de outro estabelecimento.' });
  }
  next();
}

// Exige que o token tenha uma permissao especifica.
// O proprietario da loja e funcionarios com cargo "administrador" sempre tem acesso total.
function exigirPermissao(permissao) {
  return (req, res, next) => {
    if (req.cargo === 'proprietario' || req.cargo === 'administrador') return next();
    if (Array.isArray(req.permissoes) && req.permissoes.includes(permissao)) return next();
    return res.status(403).json({ erro: 'Voce nao tem permissao para essa acao.' });
  };
}

// Exige que quem esta fazendo a requisicao seja o PROPRIO cargo proprietario
// ou administrador -- diferente de exigirPermissao, aqui nao basta ter a
// permissao "gerenciar_funcionarios" marcada; precisa ser um desses dois
// cargos mesmo. Usado para dados pessoais sensiveis (cadastro completo).
function exigirCargoAdministrativo(req, res, next) {
  if (req.cargo === 'proprietario' || req.cargo === 'administrador') return next();
  return res.status(403).json({ erro: 'So o proprietario ou administrador pode acessar o cadastro completo.' });
}

module.exports = {
  autenticar,
  garantirProprioEstabelecimento,
  exigirPermissao,
  exigirCargoAdministrativo
};
