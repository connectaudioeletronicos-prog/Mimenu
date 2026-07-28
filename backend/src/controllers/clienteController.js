const { query } = require('../config/database');
const { registrarAuditoria } = require('./funcionarioController');

// Listar clientes do estabelecimento
async function listar(req, res) {
  try {
    const { busca } = req.query;
    let sql = `SELECT id, nome, telefone, endereco, email, criado_em
               FROM clientes WHERE estabelecimento_id = $1`;
    const params = [req.estabelecimentoId];

    if (busca) {
      sql += ` AND (nome ILIKE $2 OR telefone ILIKE $2)`;
      params.push(`%${busca}%`);
    }

    sql += ` ORDER BY nome ASC`;
    const resultado = await query(sql, params);
    res.json(resultado.rows);
  } catch (error) {
    console.error('Erro ao listar clientes:', error);
    res.status(500).json({ erro: 'Erro ao listar clientes.' });
  }
}

// Buscar cliente por telefone
async function buscarPorTelefone(req, res) {
  try {
    const { telefone } = req.params;
    const telefoneLimpo = telefone.replace(/\D/g, '');

    const resultado = await query(
      `SELECT id, nome, telefone, endereco, email, criado_em
       FROM clientes
       WHERE estabelecimento_id = $1
         AND regexp_replace(telefone, '\\D', '', 'g') = $2`,
      [req.estabelecimentoId, telefoneLimpo]
    );

    if (resultado.rows.length === 0) return res.status(404).json({ erro: 'Cliente nao encontrado.' });
    res.json(resultado.rows[0]);
  } catch (error) {
    res.status(500).json({ erro: 'Erro ao buscar cliente.' });
  }
}

// Criar ou atualizar cliente (upsert por telefone)
async function criarOuAtualizar(req, res) {
  try {
    const { nome, telefone, endereco, email } = req.body;

    if (!nome || !telefone) {
      return res.status(400).json({ erro: 'Nome e telefone sao obrigatorios.' });
    }

    const resultado = await query(
      `INSERT INTO clientes (estabelecimento_id, nome, telefone, endereco, email)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (estabelecimento_id, telefone)
       DO UPDATE SET nome = EXCLUDED.nome,
                     endereco = COALESCE(EXCLUDED.endereco, clientes.endereco),
                     email = COALESCE(EXCLUDED.email, clientes.email),
                     atualizado_em = NOW()
       RETURNING *`,
      [req.estabelecimentoId, nome, telefone, endereco || null, email || null]
    );

    const cliente = resultado.rows[0];

    if (req.funcionarioId) {
      await registrarAuditoria(
        req.estabelecimentoId, req.funcionarioId, req.funcionarioNome,
        'CRIAR_OU_ATUALIZAR_CLIENTE', 'clientes', cliente.id,
        null, { nome, telefone, endereco, email }, req.ip
      );
    }

    res.status(201).json(cliente);
  } catch (error) {
    console.error('Erro ao criar/atualizar cliente:', error);
    res.status(500).json({ erro: 'Erro ao salvar cliente.' });
  }
}

// Atualizar cliente (admin, gerente ou atendente)
async function atualizar(req, res) {
  try {
    const { id } = req.params;
    const { nome, telefone, endereco, email } = req.body;

    const anterior = await query(
      'SELECT * FROM clientes WHERE id = $1 AND estabelecimento_id = $2',
      [id, req.estabelecimentoId]
    );
    if (anterior.rows.length === 0) return res.status(404).json({ erro: 'Cliente nao encontrado.' });

    const resultado = await query(
      `UPDATE clientes SET
         nome = COALESCE($1, nome),
         telefone = COALESCE($2, telefone),
         endereco = COALESCE($3, endereco),
         email = COALESCE($4, email),
         atualizado_em = NOW()
       WHERE id = $5 AND estabelecimento_id = $6 RETURNING *`,
      [nome, telefone, endereco, email, id, req.estabelecimentoId]
    );

    await registrarAuditoria(
      req.estabelecimentoId, req.funcionarioId, req.funcionarioNome,
      'ATUALIZAR_CLIENTE', 'clientes', id,
      anterior.rows[0], resultado.rows[0], req.ip
    );

    res.json(resultado.rows[0]);
  } catch (error) {
    res.status(500).json({ erro: 'Erro ao atualizar cliente.' });
  }
}

// Listar auditoria (so admin)
async function listarAuditoria(req, res) {
  try {
    const resultado = await query(
      `SELECT id, funcionario_nome, acao, tabela_afetada, dados_anteriores, dados_novos, ip, criado_em
       FROM auditoria
       WHERE estabelecimento_id = $1
       ORDER BY criado_em DESC
       LIMIT 200`,
      [req.estabelecimentoId]
    );
    res.json(resultado.rows);
  } catch (error) {
    res.status(500).json({ erro: 'Erro ao listar auditoria.' });
  }
}

module.exports = { listar, buscarPorTelefone, criarOuAtualizar, atualizar, listarAuditoria };
