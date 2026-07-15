// ===================================================================
// Middleware de autenticacao - protege rotas do painel administrativo
// ===================================================================
const jwt = require('jsonwebtoken');

function autenticar(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ erro: 'Token de autenticacao nao fornecido.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.estabelecimentoId = payload.estabelecimentoId;
    req.slug = payload.slug;
    req.cargo = payload.cargo || 'proprietario';
    req.funcionarioId = payload.funcionarioId || null;
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

module.exports = { autenticar, garantirProprioEstabelecimento, exigirPermissao };
