const jwt = require('jsonwebtoken');

// Autentica funcionario pelo token JWT
function autenticarFuncionario(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ erro: 'Token nao fornecido.' });
  }

  const token = authHeader.substring(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.funcionarioId = payload.funcionarioId || null;
    req.estabelecimentoId = payload.estabelecimentoId;
    req.cargo = payload.cargo || 'proprietario';
    req.permissoes = payload.permissoes || [];
    req.slug = payload.slug;
    next();
  } catch (error) {
    return res.status(401).json({ erro: 'Token invalido ou expirado.' });
  }
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

module.exports = { autenticarFuncionario, exigirPermissao };
