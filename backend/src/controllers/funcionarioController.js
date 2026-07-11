const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { query } = require('../config/database');

// Login de funcionario
async function loginFuncionario(req, res) {
  try {
    const { login, senha, slug } = req.body;
    if (!login || !senha || !slug) {
      return res.status(400).json({ erro: 'Login, senha e slug sao obrigatorios.' });
    }

    const estRes = await query('SELECT id FROM estabelecimentos WHERE slug = $1 AND ativo = true', [slug]);
    if (estRes.rows.length === 0) return res.status(404).json({ erro: 'Estabelecimento nao encontrado.' });
    const estabelecimentoId = estRes.rows[0].id;

    const resultado = await query(
      `SELECT id, nome, email, username, senha_hash, cargo, ativo
       FROM funcionarios
       WHERE estabelecimento_id = $1 AND (email = $2 OR username = $2)`,
      [estabelecimentoId, login]
    );

    if (resultado.rows.length === 0) return res.status(401).json({ erro: 'Login ou senha invalidos.' });
    const funcionario = resultado.rows[0];
    if (!funcionario.ativo) return res.status(403).json({ erro: 'Funcionario desativado.' });

    const senhaCorreta = await bcrypt.compare(senha, funcionario.senha_hash);
    if (!senhaCorreta) return res.status(401).json({ erro: 'Login ou senha invalidos.' });

    const token = jwt.sign(
      { funcionarioId: funcionario.id, estabelecimentoId, cargo: funcionario.cargo, slug },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    await registrarAuditoria(estabelecimentoId, funcionario.id, funcionario.nome, 'LOGIN', 'funcionarios', funcionario.id, null, null, req.ip);

    res.json({ token, funcionario: { id: funcionario.id, nome: funcionario.nome, cargo: funcionario.cargo, slug } });
  } catch (error) {
    console.error('Erro no login funcionario:', error);
    res.status(500).json({ erro: 'Erro interno ao processar login.' });
  }
}

// Listar funcionarios (admin e gerente)
async function listar(req, res) {
  try {
    const resultado = await query(
      `SELECT id, nome, email, username, cargo, ativo, criado_em
       FROM funcionarios WHERE estabelecimento_id = $1 ORDER BY criado_em ASC`,
      [req.estabelecimentoId]
    );
    res.json(resultado.rows);
  } catch (error) {
    res.status(500).json({ erro: 'Erro ao listar funcionarios.' });
  }
}

// Criar funcionario (so admin)
async function criar(req, res) {
  try {
    const { nome, email, username, senha, cargo } = req.body;

    if (!nome || !email || !senha || !cargo) {
      return res.status(400).json({ erro: 'Nome, email, senha e cargo sao obrigatorios.' });
    }

    const cargosValidos = ['administrador', 'gerente', 'atendente', 'colaborador'];
    if (!cargosValidos.includes(cargo)) return res.status(400).json({ erro: 'Cargo invalido.' });

    // Limites por cargo
    if (cargo === 'administrador') {
      const count = await query(
        `SELECT COUNT(*) FROM funcionarios WHERE estabelecimento_id = $1 AND cargo = 'administrador' AND ativo = true`,
        [req.estabelecimentoId]
      );
      if (parseInt(count.rows[0].count) >= 2) return res.status(400).json({ erro: 'Limite de 2 administradores atingido.' });
    }
    if (cargo === 'gerente') {
      const count = await query(
        `SELECT COUNT(*) FROM funcionarios WHERE estabelecimento_id = $1 AND cargo = 'gerente' AND ativo = true`,
        [req.estabelecimentoId]
      );
      if (parseInt(count.rows[0].count) >= 1) return res.status(400).json({ erro: 'Limite de 1 gerente atingido.' });
    }
    if (cargo === 'atendente') {
      const count = await query(
        `SELECT COUNT(*) FROM funcionarios WHERE estabelecimento_id = $1 AND cargo = 'atendente' AND ativo = true`,
        [req.estabelecimentoId]
      );
      if (parseInt(count.rows[0].count) >= 5) return res.status(400).json({ erro: 'Limite de 5 atendentes atingido.' });
    }

    const senhaHash = await bcrypt.hash(senha, 10);
    const resultado = await query(
      `INSERT INTO funcionarios (estabelecimento_id, nome, email, username, senha_hash, cargo)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, nome, email, username, cargo, ativo`,
      [req.estabelecimentoId, nome, email, username || null, senhaHash, cargo]
    );

    const novo = resultado.rows[0];
    await registrarAuditoria(req.estabelecimentoId, req.funcionarioId, req.funcionarioNome, 'CRIAR_FUNCIONARIO', 'funcionarios', novo.id, null, { nome, email, cargo }, req.ip);

    res.status(201).json(novo);
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ erro: 'Email ou username ja cadastrado.' });
    res.status(500).json({ erro: 'Erro ao criar funcionario.' });
  }
}

// Atualizar funcionario (so admin)
async function atualizar(req, res) {
  try {
    const { id } = req.params;
    const { nome, email, username, cargo, ativo } = req.body;

    const anterior = await query('SELECT * FROM funcionarios WHERE id = $1 AND estabelecimento_id = $2', [id, req.estabelecimentoId]);
    if (anterior.rows.length === 0) return res.status(404).json({ erro: 'Funcionario nao encontrado.' });

    const resultado = await query(
      `UPDATE funcionarios SET nome = COALESCE($1, nome), email = COALESCE($2, email),
       username = COALESCE($3, username), cargo = COALESCE($4, cargo),
       ativo = COALESCE($5, ativo), atualizado_em = NOW()
       WHERE id = $6 AND estabelecimento_id = $7 RETURNING id, nome, email, username, cargo, ativo`,
      [nome, email, username, cargo, ativo, id, req.estabelecimentoId]
    );

    await registrarAuditoria(req.estabelecimentoId, req.funcionarioId, req.funcionarioNome, 'ATUALIZAR_FUNCIONARIO', 'funcionarios', id, anterior.rows[0], resultado.rows[0], req.ip);

    res.json(resultado.rows[0]);
  } catch (error) {
    res.status(500).json({ erro: 'Erro ao atualizar funcionario.' });
  }
}

// Trocar senha (admin troca qualquer um, funcionario troca a propria)
async function trocarSenha(req, res) {
  try {
    const { id } = req.params;
    const { senhaAtual, novaSenha } = req.body;

    if (!novaSenha || novaSenha.length < 6) return res.status(400).json({ erro: 'Nova senha deve ter pelo menos 6 caracteres.' });

    const resultado = await query('SELECT senha_hash FROM funcionarios WHERE id = $1 AND estabelecimento_id = $2', [id, req.estabelecimentoId]);
    if (resultado.rows.length === 0) return res.status(404).json({ erro: 'Funcionario nao encontrado.' });

    // Se nao for admin, precisa confirmar senha atual
    if (req.cargo !== 'administrador') {
      if (!senhaAtual) return res.status(400).json({ erro: 'Senha atual obrigatoria.' });
      const correta = await bcrypt.compare(senhaAtual, resultado.rows[0].senha_hash);
      if (!correta) return res.status(401).json({ erro: 'Senha atual incorreta.' });
    }

    const novoHash = await bcrypt.hash(novaSenha, 10);
    await query('UPDATE funcionarios SET senha_hash = $1, atualizado_em = NOW() WHERE id = $2', [novoHash, id]);

    await registrarAuditoria(req.estabelecimentoId, req.funcionarioId, req.funcionarioNome, 'TROCAR_SENHA_FUNCIONARIO', 'funcionarios', id, null, null, req.ip);

    res.json({ mensagem: 'Senha alterada com sucesso.' });
  } catch (error) {
    res.status(500).json({ erro: 'Erro ao trocar senha.' });
  }
}

// Registrar auditoria
async function registrarAuditoria(estabelecimentoId, funcionarioId, funcionarioNome, acao, tabela, registroId, dadosAnteriores, dadosNovos, ip) {
  try {
    await query(
      `INSERT INTO auditoria (estabelecimento_id, funcionario_id, funcionario_nome, acao, tabela_afetada, registro_id, dados_anteriores, dados_novos, ip)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [estabelecimentoId, funcionarioId || null, funcionarioNome || null, acao, tabela || null, registroId || null,
       dadosAnteriores ? JSON.stringify(dadosAnteriores) : null,
       dadosNovos ? JSON.stringify(dadosNovos) : null, ip || null]
    );
  } catch (e) {
    console.error('Erro ao registrar auditoria:', e);
  }
}

module.exports = { loginFuncionario, listar, criar, atualizar, trocarSenha, registrarAuditoria };
