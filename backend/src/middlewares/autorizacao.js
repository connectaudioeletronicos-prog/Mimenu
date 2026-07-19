const jwt = require('jsonwebtoken');
const { query } = require('../config/database');

// Autentica funcionario pelo token JWT
async function autenticarFuncionario(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ erro: 'Token nao fornecido.' });
  }

  const token = authHeader.substring(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const funcionarioId = payload.funcionarioId || null;

    // Busca no banco o estado ATUAL do funcionario -- ativo, cargo e
    // permissoes -- em vez de confiar no que ficou gravado no token no
    // momento do login. Assim, excluir, desativar ou mudar as permissoes
    // de um funcionario tem efeito imediato na proxima requisicao, mesmo
    // que ele ja esteja logado com um token antigo e ainda valido.
    if (funcionarioId) {
      const resultado = await query('SELECT ativo, cargo, permissoes FROM funcionarios WHERE id = $1', [funcionarioId]);
      if (resultado.rows.length === 0 || !resultado.rows[0].ativo) {
        return res.status(401).json({ erro: 'Seu acesso foi revogado. Faca login novamente.' });
      }
      req.funcionarioId = funcionarioId;
      req.estabelecimentoId = payload.estabelecimentoId;
      req.cargo = resultado.rows[0].cargo;
      req.permissoes = resultado.rows[0].permissoes || [];
      req.slug = payload.slug;
      return next();
    }

    req.funcionarioId = null;
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

// Exige que quem esta fazendo a requisicao seja o PROPRIO cargo proprietario
// ou administrador -- diferente de exigirPermissao, aqui nao basta ter a
// permissao "gerenciar_funcionarios" marcada; precisa ser um desses dois
// cargos mesmo. Usado para dados pessoais sensiveis (cadastro completo).
function exigirCargoAdministrativo(req, res, next) {
  if (req.cargo === 'proprietario' || req.cargo === 'administrador') return next();
  return res.status(403).json({ erro: 'So o proprietario ou administrador pode acessar o cadastro completo.' });
}

module.exports = { autenticarFuncionario, exigirPermissao, exigirCargoAdministrativo };
