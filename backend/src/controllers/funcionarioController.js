const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { query } = require('../config/database');
const { validarTelefone, validarCPF } = require('../utils/validadores');
const { gerarQRCodeBase64 } = require('../utils/qrcode');
const { agoraNoFuso, dataParaISO } = require('../utils/horario');

// As 9 permissoes possiveis (caixinhas). O cargo NAO define o que o
// funcionario pode fazer -- serve so para limitar quantos de cada
// categoria podem existir. Quem manda de verdade e esse array.
const PERMISSOES_VALIDAS = [
  'gerenciar_funcionarios',       // cadastrar/descadastrar funcionarios
  'editar_funcionarios',          // editar dados / trocar senha de outros funcionarios
  'gerenciar_cardapio',           // produtos, categorias, promocoes (incl. precos)
  'criar_pedidos',
  'cancelar_pedidos',
  'mudar_status_pedidos',
  'ver_valores_concluidos',       // ver valores de pedidos entregues/cancelados
  'corrigir_valores_concluidos',  // alterar valores de pedidos ja concluidos
  'gerenciar_conta',              // configuracoes de conta/pagamento/paginas legais
  'ver_caixa_geral'               // ver o caixa geral (valores das entregas concluidas)
];

const CARGOS_VALIDOS = ['administrador', 'gerente', 'caixa', 'garcom', 'colaborador', 'cozinha', 'entregador'];
const LIMITES_POR_CARGO = { administrador: 1, gerente: 1, caixa: 5 }; // garcom/colaborador/cozinha/entregador: sem limite

// Carga horaria (opcional): { dias: ['seg','ter',...], inicio: 'HH:MM', fim: 'HH:MM' }.
// Um unico turno por funcionario e o suficiente pro que foi pedido; se um
// dia precisar de mais de um turno no futuro, isso vira um array de turnos.
const DIAS_SEMANA_VALIDOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
function sanitizarCargaHoraria(carga) {
  if (!carga || typeof carga !== 'object' || Array.isArray(carga)) return {};
  const horaValida = (h) => typeof h === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(h);
  const dias = Array.isArray(carga.dias) ? [...new Set(carga.dias.filter(d => DIAS_SEMANA_VALIDOS.includes(d)))] : [];
  const inicio = horaValida(carga.inicio) ? carga.inicio : null;
  const fim = horaValida(carga.fim) ? carga.fim : null;
  if (dias.length === 0 && !inicio && !fim) return {};
  return { dias, inicio, fim };
}

function sanitizarPermissoes(permissoes) {
  if (!Array.isArray(permissoes)) return [];
  return permissoes.filter(p => PERMISSOES_VALIDAS.includes(p));
}

function gerarTokenSessao(funcionario, estabelecimentoId, slug) {
  const permissoes = funcionario.cargo === 'administrador' ? PERMISSOES_VALIDAS : (funcionario.permissoes || []);
  return jwt.sign(
    { funcionarioId: funcionario.id, estabelecimentoId, cargo: funcionario.cargo, permissoes, slug },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );
}

// Login de funcionario
async function loginFuncionario(req, res) {
  try {
    const { login, senha, slug } = req.body;
    if (!login || !senha || !slug) {
      return res.status(400).json({ erro: 'Login, senha e slug sao obrigatorios.' });
    }

    const estRes = await query('SELECT id, nome FROM estabelecimentos WHERE slug = $1 AND ativo = true', [slug]);
    if (estRes.rows.length === 0) return res.status(404).json({ erro: 'Estabelecimento nao encontrado.' });
    const estabelecimentoId = estRes.rows[0].id;
    const estabelecimentoNome = estRes.rows[0].nome;

    const resultado = await query(
      `SELECT id, nome, email, username, senha_hash, cargo, permissoes, ativo,
              forma_pagamento_entrega, valor_por_entrega, valor_por_km
       FROM funcionarios
       WHERE estabelecimento_id = $1 AND (email = $2 OR username = $2)`,
      [estabelecimentoId, login]
    );

    if (resultado.rows.length === 0) return res.status(401).json({ erro: 'Login ou senha invalidos.' });
    const funcionario = resultado.rows[0];
    if (!funcionario.ativo) return res.status(403).json({ erro: 'Funcionario desativado.' });

    const senhaCorreta = await bcrypt.compare(senha, funcionario.senha_hash);
    if (!senhaCorreta) return res.status(401).json({ erro: 'Login ou senha invalidos.' });

    const permissoes = funcionario.cargo === 'administrador' ? PERMISSOES_VALIDAS : (funcionario.permissoes || []);
    const token = gerarTokenSessao(funcionario, estabelecimentoId, slug);

    await registrarAuditoria(estabelecimentoId, funcionario.id, funcionario.nome, 'LOGIN', 'funcionarios', funcionario.id, null, null, req.ip);

    res.json({
      token,
      funcionario: {
        id: funcionario.id, nome: funcionario.nome, cargo: funcionario.cargo, permissoes, slug,
        estabelecimentoNome,
        formaPagamentoEntrega: funcionario.forma_pagamento_entrega,
        valorPorEntrega: funcionario.valor_por_entrega,
        valorPorKm: funcionario.valor_por_km
      }
    });
  } catch (error) {
    console.error('Erro no login funcionario:', error);
    res.status(500).json({ erro: 'Erro interno ao processar login.' });
  }
}

// Login por link definitivo (so pra facilitar o acesso -- nao substitui o
// login com senha, que continua funcionando normalmente). O funcionario
// recebe esse link uma vez, ao ser cadastrado, e pode salvar/favoritar.
async function acessarPorLink(req, res) {
  try {
    const { token } = req.params;
    const resultado = await query(
      `SELECT f.id, f.nome, f.cargo, f.permissoes, f.ativo,
              f.forma_pagamento_entrega, f.valor_por_entrega, f.valor_por_km,
              e.id AS estabelecimento_id, e.slug, e.nome AS estabelecimento_nome
       FROM funcionarios f JOIN estabelecimentos e ON e.id = f.estabelecimento_id
       WHERE f.token_acesso = $1`,
      [token]
    );
    if (resultado.rows.length === 0) return res.status(404).json({ erro: 'Link de acesso invalido.' });
    const f = resultado.rows[0];
    if (!f.ativo) return res.status(403).json({ erro: 'Funcionario desativado.' });

    const permissoes = f.cargo === 'administrador' ? PERMISSOES_VALIDAS : (f.permissoes || []);
    const tokenSessao = gerarTokenSessao({ id: f.id, cargo: f.cargo, permissoes }, f.estabelecimento_id, f.slug);

    res.json({
      token: tokenSessao,
      funcionario: {
        id: f.id, nome: f.nome, cargo: f.cargo, permissoes, slug: f.slug, estabelecimentoNome: f.estabelecimento_nome,
        formaPagamentoEntrega: f.forma_pagamento_entrega, valorPorEntrega: f.valor_por_entrega, valorPorKm: f.valor_por_km
      }
    });
  } catch (error) {
    console.error('Erro no acesso por link:', error);
    res.status(500).json({ erro: 'Erro interno ao processar o acesso.' });
  }
}

// Listar funcionarios
async function listar(req, res) {
  try {
    const resultado = await query(
      `SELECT id, nome, email, username, telefone, celular, data_nascimento, rg, cpf, cargo, permissoes, ativo, ordem, carga_horaria, token_acesso, criado_em,
              forma_pagamento_entrega, valor_por_entrega, valor_por_km
       FROM funcionarios WHERE estabelecimento_id = $1 ORDER BY ordem ASC, criado_em ASC`,
      [req.estabelecimentoId]
    );
    res.json(resultado.rows);
  } catch (error) {
    res.status(500).json({ erro: 'Erro ao listar funcionarios.' });
  }
}

// Criar funcionario
async function criar(req, res) {
  try {
    const { nome, email, username, senha, cargo, permissoes, telefone, carga_horaria } = req.body;

    if (!nome || !email || !senha || !cargo) {
      return res.status(400).json({ erro: 'Nome, email, senha e categoria sao obrigatorios.' });
    }
    if (!CARGOS_VALIDOS.includes(cargo)) return res.status(400).json({ erro: 'Categoria invalida.' });
    if (telefone && !validarTelefone(telefone)) {
      return res.status(400).json({ erro: 'Telefone invalido. Use o formato (DDD) 000000000.' });
    }

    const limite = LIMITES_POR_CARGO[cargo];
    if (limite) {
      const count = await query(
        `SELECT COUNT(*) FROM funcionarios WHERE estabelecimento_id = $1 AND cargo = $2 AND ativo = true`,
        [req.estabelecimentoId, cargo]
      );
      if (parseInt(count.rows[0].count) >= limite) {
        return res.status(400).json({ erro: `Limite de ${limite} para essa categoria ja foi atingido.` });
      }
    }

    const permissoesFinais = cargo === 'administrador' ? PERMISSOES_VALIDAS : sanitizarPermissoes(permissoes);
    const senhaHash = await bcrypt.hash(senha, 10);
    const tokenAcesso = crypto.randomBytes(20).toString('hex');

    const contagemTotal = await query('SELECT COUNT(*) FROM funcionarios WHERE estabelecimento_id = $1', [req.estabelecimentoId]);
    const proximaOrdem = parseInt(contagemTotal.rows[0].count);

    const resultado = await query(
      `INSERT INTO funcionarios (estabelecimento_id, nome, email, username, telefone, senha_hash, cargo, permissoes, ordem, carga_horaria, token_acesso)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id, nome, email, username, telefone, cargo, permissoes, ativo, ordem, carga_horaria, token_acesso`,
      [req.estabelecimentoId, nome, email, username || null, telefone || null, senhaHash, cargo, JSON.stringify(permissoesFinais), proximaOrdem, JSON.stringify(sanitizarCargaHoraria(carga_horaria)), tokenAcesso]
    );

    const novo = resultado.rows[0];
    await registrarAuditoria(req.estabelecimentoId, req.funcionarioId, req.funcionarioNome, 'CRIAR_FUNCIONARIO', 'funcionarios', novo.id, null, { nome, email, cargo, permissoes: permissoesFinais }, req.ip);

    res.status(201).json(novo);
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ erro: 'Email ou username ja cadastrado.' });
    console.error('Erro ao criar funcionario:', error);
    res.status(500).json({ erro: 'Erro ao criar funcionario.', detalhe: error.message, codigo: error.code });
  }
}

// Atualizar funcionario (dados, categoria, permissoes, ativo/inativo)
async function atualizar(req, res) {
  try {
    const { id } = req.params;
    const { nome, email, username, cargo, ativo, permissoes, ordem, telefone, carga_horaria, forma_pagamento_entrega, valor_por_entrega, valor_por_km } = req.body;

    if (cargo && !CARGOS_VALIDOS.includes(cargo)) return res.status(400).json({ erro: 'Categoria invalida.' });
    if (telefone && !validarTelefone(telefone)) {
      return res.status(400).json({ erro: 'Telefone invalido. Use o formato (DDD) 000000000.' });
    }
    if (forma_pagamento_entrega && !['entrega', 'km'].includes(forma_pagamento_entrega)) {
      return res.status(400).json({ erro: 'Forma de pagamento invalida.' });
    }

    const anterior = await query('SELECT * FROM funcionarios WHERE id = $1 AND estabelecimento_id = $2', [id, req.estabelecimentoId]);
    if (anterior.rows.length === 0) return res.status(404).json({ erro: 'Funcionario nao encontrado.' });

    const cargoFinal = cargo || anterior.rows[0].cargo;
    const permissoesFinais = cargoFinal === 'administrador'
      ? PERMISSOES_VALIDAS
      : (permissoes !== undefined ? sanitizarPermissoes(permissoes) : undefined);
    const cargaHorariaFinal = carga_horaria !== undefined ? sanitizarCargaHoraria(carga_horaria) : undefined;

    const resultado = await query(
      `UPDATE funcionarios SET nome = COALESCE($1, nome), email = COALESCE($2, email),
       username = COALESCE($3, username), cargo = COALESCE($4, cargo),
       ativo = COALESCE($5, ativo),
       permissoes = COALESCE($6, permissoes),
       ordem = COALESCE($7, ordem),
       telefone = COALESCE($8, telefone),
       carga_horaria = COALESCE($9, carga_horaria),
       forma_pagamento_entrega = COALESCE($10, forma_pagamento_entrega),
       valor_por_entrega = COALESCE($11, valor_por_entrega),
       valor_por_km = COALESCE($12, valor_por_km),
       atualizado_em = NOW()
       WHERE id = $13 AND estabelecimento_id = $14 RETURNING id, nome, email, username, telefone, cargo, permissoes, ativo, ordem, carga_horaria, forma_pagamento_entrega, valor_por_entrega, valor_por_km`,
      [
        nome, email, username, cargo, ativo,
        permissoesFinais !== undefined ? JSON.stringify(permissoesFinais) : null,
        ordem, telefone,
        cargaHorariaFinal !== undefined ? JSON.stringify(cargaHorariaFinal) : null,
        forma_pagamento_entrega || null,
        valor_por_entrega !== undefined && valor_por_entrega !== '' ? parseFloat(valor_por_entrega) : null,
        valor_por_km !== undefined && valor_por_km !== '' ? parseFloat(valor_por_km) : null,
        id, req.estabelecimentoId
      ]
    );

    await registrarAuditoria(req.estabelecimentoId, req.funcionarioId, req.funcionarioNome, 'ATUALIZAR_FUNCIONARIO', 'funcionarios', id, anterior.rows[0], resultado.rows[0], req.ip);

    res.json(resultado.rows[0]);
  } catch (error) {
    console.error('Erro ao atualizar funcionario:', error);
    res.status(500).json({ erro: 'Erro ao atualizar funcionario.' });
  }
}

// Cadastro completo (opcional) do funcionario: nome ja existe, aqui e so o
// complemento -- data de nascimento, RG, CPF, celular (obrigatorio) e
// telefone fixo (opcional). Restrito a proprietario/administrador na ROTA
// (exigirCargoAdministrativo), nao so por permissao, ja que sao dados
// pessoais sensiveis do funcionario.
async function atualizarCadastroCompleto(req, res) {
  try {
    const { id } = req.params;
    const { data_nascimento, rg, cpf, celular, telefone } = req.body;

    if (!celular || !validarTelefone(celular)) {
      return res.status(400).json({ erro: 'Celular e obrigatorio. Use o formato (DDD) 000000000.' });
    }
    if (telefone && !validarTelefone(telefone)) {
      return res.status(400).json({ erro: 'Telefone invalido. Use o formato (DDD) 000000000.' });
    }
    if (cpf && !validarCPF(cpf)) {
      return res.status(400).json({ erro: 'CPF invalido. Use o formato 000.000.000-00.' });
    }

    const anterior = await query('SELECT id FROM funcionarios WHERE id = $1 AND estabelecimento_id = $2', [id, req.estabelecimentoId]);
    if (anterior.rows.length === 0) return res.status(404).json({ erro: 'Funcionario nao encontrado.' });

    const resultado = await query(
      `UPDATE funcionarios SET
        data_nascimento = COALESCE($1, data_nascimento),
        rg = COALESCE($2, rg),
        cpf = COALESCE($3, cpf),
        celular = $4,
        telefone = COALESCE($5, telefone),
        atualizado_em = NOW()
       WHERE id = $6 AND estabelecimento_id = $7
       RETURNING id, nome, email, telefone, celular, data_nascimento, rg, cpf`,
      [data_nascimento || null, rg || null, cpf || null, celular, telefone || null, id, req.estabelecimentoId]
    );

    await registrarAuditoria(req.estabelecimentoId, req.funcionarioId, req.funcionarioNome, 'ATUALIZAR_CADASTRO_COMPLETO_FUNCIONARIO', 'funcionarios', id, null, { preenchido: true }, req.ip);

    res.json(resultado.rows[0]);
  } catch (error) {
    console.error('Erro ao atualizar cadastro completo do funcionario:', error);
    res.status(500).json({ erro: 'Erro ao atualizar cadastro completo.' });
  }
}

// Trocar senha (funcionario troca a propria sempre; para trocar a de outro, a rota exige a permissao 'editar_funcionarios')
async function trocarSenha(req, res) {
  try {
    const { id } = req.params;
    const { senhaAtual, novaSenha } = req.body;

    if (!novaSenha || novaSenha.length < 6) return res.status(400).json({ erro: 'Nova senha deve ter pelo menos 6 caracteres.' });

    const resultado = await query('SELECT senha_hash FROM funcionarios WHERE id = $1 AND estabelecimento_id = $2', [id, req.estabelecimentoId]);
    if (resultado.rows.length === 0) return res.status(404).json({ erro: 'Funcionario nao encontrado.' });

    const trocandoAPropria = req.funcionarioId && req.funcionarioId === id;

    // Trocando a propria senha: precisa confirmar a senha atual.
    // Trocando a de outro (via permissao editar_funcionarios): nao precisa saber a senha antiga.
    if (trocandoAPropria) {
      if (!senhaAtual) return res.status(400).json({ erro: 'Senha atual obrigatoria.' });
      const correta = await bcrypt.compare(senhaAtual, resultado.rows[0].senha_hash);
      if (!correta) return res.status(401).json({ erro: 'Senha atual incorreta.' });
    }

    const novoHash = await bcrypt.hash(novaSenha, 10);
    await query('UPDATE funcionarios SET senha_hash = $1, atualizado_em = NOW() WHERE id = $2', [novoHash, id]);

    await registrarAuditoria(req.estabelecimentoId, req.funcionarioId, req.funcionarioNome, 'TROCAR_SENHA_FUNCIONARIO', 'funcionarios', id, null, null, req.ip);

    res.json({ mensagem: 'Senha alterada com sucesso.' });
  } catch (error) {
    console.error('Erro ao trocar senha:', error);
    res.status(500).json({ erro: 'Erro ao trocar senha.' });
  }
}

// Lista a equipe agrupada por funcao operacional, pra aba "Equipe" do
// dashboard: cozinha, entregadores (com posicao na fila de atribuicao
// automatica) e atendimento (garcom/caixa/colaborador).
async function listarEquipeOperacional(req, res) {
  try {
    const resultado = await query(
      `SELECT f.id, f.nome, f.email, f.cargo, f.ativo, f.disponivel_entrega,
              f.total_entregas, f.ultima_fila_em, f.token_acesso, f.carga_horaria, f.liberado_hora_extra_data,
              EXISTS (
                SELECT 1 FROM pedidos p
                WHERE p.entregador_id = f.id AND p.status_pedido = 'saiu_entrega'
              ) AS em_entrega
       FROM funcionarios f
       WHERE f.estabelecimento_id = $1
         AND f.cargo IN ('cozinha', 'entregador', 'garcom', 'caixa', 'colaborador')
       ORDER BY f.cargo, f.ultima_fila_em ASC NULLS FIRST, f.criado_em ASC`,
      [req.estabelecimentoId]
    );

    const cozinha = resultado.rows.filter(f => f.cargo === 'cozinha');
    const atendimento = resultado.rows.filter(f => ['garcom', 'caixa', 'colaborador'].includes(f.cargo));

    // So entram na numeracao da fila os entregadores ativos, disponiveis e
    // que nao estejam com uma entrega em andamento agora.
    let posicao = 0;
    const entregadores = resultado.rows
      .filter(f => f.cargo === 'entregador')
      .map(f => {
        let posicaoFila = null;
        if (f.ativo && f.disponivel_entrega && !f.em_entrega) {
          posicao += 1;
          posicaoFila = posicao;
        }
        return { ...f, posicao_fila: posicaoFila };
      });

    res.json({ cozinha, entregadores, atendimento });
  } catch (error) {
    console.error('Erro ao listar equipe operacional:', error);
    res.status(500).json({ erro: 'Erro ao listar equipe operacional.' });
  }
}

// Liga/desliga a disponibilidade de um entregador pra fila de atribuicao
// automatica. O proprio entregador pode alternar a propria disponibilidade;
// pra alternar a de outro, precisa da permissao 'gerenciar_funcionarios'.
// Ao voltar a ficar disponivel, ele entra no fim da fila (ultima_fila_em =
// agora), respeitando a regra de sempre seguir a ordem de chegada.
async function alternarDisponibilidadeEntregador(req, res) {
  try {
    const { id } = req.params;
    const { disponivel_entrega } = req.body;

    const podeGerenciarOutro = req.cargo === 'proprietario' || req.cargo === 'administrador' ||
      (req.permissoes || []).includes('gerenciar_funcionarios');
    const ehOProprio = req.funcionarioId && req.funcionarioId === id;
    if (!ehOProprio && !podeGerenciarOutro) {
      return res.status(403).json({ erro: 'Voce nao tem permissao para alterar a disponibilidade desse entregador.' });
    }

    const alvo = await query('SELECT cargo, disponivel_entrega FROM funcionarios WHERE id = $1 AND estabelecimento_id = $2', [id, req.estabelecimentoId]);
    if (alvo.rows.length === 0) return res.status(404).json({ erro: 'Funcionario nao encontrado.' });
    if (alvo.rows[0].cargo !== 'entregador') return res.status(400).json({ erro: 'Esse funcionario nao e um entregador.' });

    const novoValor = !!disponivel_entrega;
    const voltandoADisponibilizar = novoValor === true && alvo.rows[0].disponivel_entrega === false;

    const resultado = await query(
      `UPDATE funcionarios SET
        disponivel_entrega = $1,
        ultima_fila_em = CASE WHEN $2 THEN NOW() ELSE ultima_fila_em END,
        atualizado_em = NOW()
       WHERE id = $3 AND estabelecimento_id = $4
       RETURNING id, nome, disponivel_entrega`,
      [novoValor, voltandoADisponibilizar, id, req.estabelecimentoId]
    );

    res.json(resultado.rows[0]);
  } catch (error) {
    console.error('Erro ao alternar disponibilidade do entregador:', error);
    res.status(500).json({ erro: 'Erro ao alternar disponibilidade do entregador.' });
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

// Exclui definitivamente um funcionario. Exige a senha de quem esta fazendo a
// exclusao (proprietario ou funcionario administrador) como confirmacao.
async function excluir(req, res) {
  try {
    const { id } = req.params;
    const { senhaConfirmacao } = req.body;

    if (!senhaConfirmacao) {
      return res.status(400).json({ erro: 'Informe sua senha para confirmar a exclusao.' });
    }

    let hashParaConferir;
    if (req.funcionarioId) {
      const quem = await query('SELECT senha_hash FROM funcionarios WHERE id = $1', [req.funcionarioId]);
      if (quem.rows.length === 0) return res.status(401).json({ erro: 'Sessao invalida.' });
      hashParaConferir = quem.rows[0].senha_hash;
    } else {
      const quem = await query('SELECT senha_hash FROM estabelecimentos WHERE id = $1', [req.estabelecimentoId]);
      hashParaConferir = quem.rows[0].senha_hash;
    }

    const senhaCorreta = await bcrypt.compare(senhaConfirmacao, hashParaConferir);
    if (!senhaCorreta) return res.status(401).json({ erro: 'Senha incorreta.' });

    const anterior = await query('SELECT * FROM funcionarios WHERE id = $1 AND estabelecimento_id = $2', [id, req.estabelecimentoId]);
    if (anterior.rows.length === 0) return res.status(404).json({ erro: 'Funcionario nao encontrado.' });

    await query('DELETE FROM funcionarios WHERE id = $1 AND estabelecimento_id = $2', [id, req.estabelecimentoId]);

    await registrarAuditoria(req.estabelecimentoId, req.funcionarioId, req.funcionarioNome, 'EXCLUIR_FUNCIONARIO', 'funcionarios', id, anterior.rows[0], null, req.ip);

    res.json({ mensagem: 'Funcionario excluido com sucesso.' });
  } catch (error) {
    console.error('Erro ao excluir funcionario:', error);
    res.status(500).json({ erro: 'Erro interno ao excluir funcionario.', detalhe: error.message, codigo: error.code });
  }
}

// ===================================================================
// Checkin diario do entregador via QR Code
// ===================================================================

// Gera (ou reaproveita, se ja foi gerado hoje) o token do QR Code do dia
// pra esse estabelecimento. E esse QR que fica exposto fisicamente na loja
// (impresso, ou numa tela) pro entregador ler com a camera do celular ao
// chegar, confirmando presenca antes de entrar na fila de entregas do dia.
async function obterQrcodeDoDia(req, res) {
  try {
    const atual = await query(
      'SELECT qrcode_entregador_token, qrcode_entregador_data FROM estabelecimentos WHERE id = $1',
      [req.estabelecimentoId]
    );
    let token = atual.rows[0]?.qrcode_entregador_token;
    const dataAtual = atual.rows[0]?.qrcode_entregador_data;
    const jaEhDeHoje = dataAtual && dataParaISO(dataAtual) === agoraNoFuso().dataISO;

    if (!token || !jaEhDeHoje) {
      token = crypto.randomBytes(16).toString('hex');
      await query(
        'UPDATE estabelecimentos SET qrcode_entregador_token = $1, qrcode_entregador_data = CURRENT_DATE WHERE id = $2',
        [token, req.estabelecimentoId]
      );
    }

    // O conteudo do QR e so o token (o app do entregador le e manda pro
    // endpoint de checkin -- nao precisa ser um link).
    const qrcodeBase64 = await gerarQRCodeBase64(token);
    res.json({ qrcode_base64: qrcodeBase64, codigo: token, valido_ate: 'fim do dia' });
  } catch (error) {
    console.error('Erro ao gerar QR Code do dia:', error);
    res.status(500).json({ erro: 'Erro ao gerar QR Code do dia.' });
  }
}

// O entregador le o QR do dia (com a camera, no proprio app) e manda o
// token lido pra ca. Confirma presenca no dia e libera ele pra entrar na
// fila de ofertas de entrega.
async function checkinEntregador(req, res) {
  try {
    if (req.cargo !== 'entregador') {
      return res.status(403).json({ erro: 'Checkin disponivel apenas para entregadores.' });
    }
    const { token } = req.body;
    if (!token) return res.status(400).json({ erro: 'Informe o codigo lido do QR.' });

    const est = await query(
      'SELECT qrcode_entregador_token, qrcode_entregador_data FROM estabelecimentos WHERE id = $1',
      [req.estabelecimentoId]
    );
    const tokenValido = est.rows[0]?.qrcode_entregador_token;
    const dataValida = est.rows[0]?.qrcode_entregador_data;
    const ehDeHoje = dataValida && dataParaISO(dataValida) === agoraNoFuso().dataISO;

    if (!ehDeHoje || !tokenValido || tokenValido !== token) {
      return res.status(400).json({ erro: 'QR Code invalido ou vencido. Peca o QR do dia atualizado na loja.' });
    }

    await query(
      'UPDATE funcionarios SET ultimo_checkin_data = CURRENT_DATE, disponivel_entrega = true, ultima_fila_em = COALESCE(ultima_fila_em, NOW()) WHERE id = $1',
      [req.funcionarioId]
    );

    // Abre um plantao novo se nao houver nenhum aberto pra esse entregador
    // (ON CONFLICT protege contra o indice unico de plantao aberto, caso
    // duas chamadas cheguem quase juntas).
    await query(
      `INSERT INTO plantoes_entregador (estabelecimento_id, funcionario_id)
       SELECT $1, $2
       WHERE NOT EXISTS (
         SELECT 1 FROM plantoes_entregador WHERE funcionario_id = $2 AND fim IS NULL
       )`,
      [req.estabelecimentoId, req.funcionarioId]
    );

    // Ao bater o ponto, ja tenta puxar algum pedido "pronto" esperando fila.
    const { tentarOfertarPedidosPendentes } = require('./pedidoController');
    await tentarOfertarPedidosPendentes(req.estabelecimentoId);

    res.json({ mensagem: 'Checkin realizado. Voce esta na fila de entregas de hoje.' });
  } catch (error) {
    console.error('Erro no checkin do entregador:', error);
    res.status(500).json({ erro: 'Erro ao fazer checkin.' });
  }
}

// ===================================================================
// Horario de funcionamento do app (carga horaria) + liberacao de hora extra
// ===================================================================

// true = pode usar o app agora. Sem carga horaria configurada = sem
// restricao nenhuma (sempre liberado).
function dentroDoHorario(cargaHoraria) {
  if (!cargaHoraria || !Array.isArray(cargaHoraria.dias) || cargaHoraria.dias.length === 0 || !cargaHoraria.inicio || !cargaHoraria.fim) {
    return true;
  }
  const { hora, diaSemana } = agoraNoFuso();

  // Turno "normal", termina no mesmo dia (ex: 08:00 as 18:00).
  if (cargaHoraria.fim >= cargaHoraria.inicio) {
    return cargaHoraria.dias.includes(diaSemana) && hora >= cargaHoraria.inicio && hora <= cargaHoraria.fim;
  }

  // Turno atravessa a meia-noite (ex: 18:00 as 05:00): a comparacao simples
  // "hora >= inicio && hora <= fim" nunca seria verdadeira nesse caso (nao
  // existe hora ao mesmo tempo >= 18:00 e <= 05:00), entao precisa checar
  // as duas metades separadas -- ou esta na parte de hoje a noite (depois
  // do inicio) ou na madrugada de hoje que pertence ao turno que comecou
  // ONTEM (antes do fim).
  const indiceHoje = DIAS_SEMANA_VALIDOS.indexOf(diaSemana);
  const diaAnterior = DIAS_SEMANA_VALIDOS[(indiceHoje + 6) % 7];
  const comecouHoje = cargaHoraria.dias.includes(diaSemana) && hora >= cargaHoraria.inicio;
  const continuaDeOntem = cargaHoraria.dias.includes(diaAnterior) && hora <= cargaHoraria.fim;
  return comecouHoje || continuaDeOntem;
}

// Cargos para os quais a checagem de carga horaria / hora extra fica
// DESATIVADA por enquanto (o app libera acesso o tempo todo, mesmo com
// carga_horaria cadastrada ou sem hora extra liberada). O restante do
// mecanismo (dentroDoHorario, liberarHoraExtra, coluna liberado_hora_extra_data
// etc.) continua intacto para ser reativado ou estendido a outros cargos
// futuramente -- so precisa remover o cargo desta lista.
const CARGOS_SEM_CHECAGEM_DE_HORARIO = ['entregador'];

// Middleware: bloqueia o uso do app fora do horario configurado, a menos
// que o gestor tenha liberado hora extra pra hoje. So se aplica aos apps
// proprios de funcionario (entregador etc.), nunca ao painel administrativo.
async function exigirDentroDoHorario(req, res, next) {
  if (CARGOS_SEM_CHECAGEM_DE_HORARIO.includes(req.cargo)) return next();
  try {
    const resultado = await query(
      'SELECT carga_horaria, liberado_hora_extra_data FROM funcionarios WHERE id = $1',
      [req.funcionarioId]
    );
    const f = resultado.rows[0];
    if (!f) return res.status(404).json({ erro: 'Funcionario nao encontrado.' });

    const liberadoHoje = f.liberado_hora_extra_data && dataParaISO(f.liberado_hora_extra_data) === agoraNoFuso().dataISO;
    if (liberadoHoje || dentroDoHorario(f.carga_horaria)) return next();

    return res.status(403).json({ erro: 'Fora do horario de expediente. Peca ao seu gestor pra liberar hora extra se precisar acessar agora.', fora_do_horario: true });
  } catch (error) {
    console.error('Erro ao verificar horario do funcionario:', error);
    res.status(500).json({ erro: 'Erro ao verificar horario.' });
  }
}

// Gestor libera hora extra pra um funcionario especifico, valido so hoje.
async function liberarHoraExtra(req, res) {
  try {
    const { id } = req.params;
    const resultado = await query(
      `UPDATE funcionarios SET liberado_hora_extra_data = CURRENT_DATE
       WHERE id = $1 AND estabelecimento_id = $2 RETURNING id`,
      [id, req.estabelecimentoId]
    );
    if (resultado.rows.length === 0) return res.status(404).json({ erro: 'Funcionario nao encontrado.' });
    res.json({ mensagem: 'Hora extra liberada para hoje. Reenvie o link/QR de acesso dele se precisar.' });
  } catch (error) {
    console.error('Erro ao liberar hora extra:', error);
    res.status(500).json({ erro: 'Erro ao liberar hora extra.' });
  }
}

// Gera um QR Code generico a partir de qualquer texto/link (usado pelo
// painel pra transformar o link de acesso de um funcionario em QR, por
// exemplo). Nao guarda nada -- so converte o conteudo recebido em imagem.
async function gerarQrcodeGenerico(req, res) {
  try {
    const { conteudo } = req.body;
    if (!conteudo || typeof conteudo !== 'string') return res.status(400).json({ erro: 'Informe o conteudo do QR Code.' });
    const qrcodeBase64 = await gerarQRCodeBase64(conteudo);
    res.json({ qrcode_base64: qrcodeBase64 });
  } catch (error) {
    console.error('Erro ao gerar QR Code generico:', error);
    res.status(500).json({ erro: 'Erro ao gerar QR Code.' });
  }
}

// ===================================================================
// Plantao do entregador (inicio/fim, resumo e historico)
// ===================================================================

// Retorna o plantao aberto do proprio entregador (ou null se nao tiver
// nenhum), com os totais calculados em tempo real a partir das entregas
// concluidas nesse plantao ate agora.
async function obterPlantaoAtual(req, res) {
  try {
    const aberto = await query(
      'SELECT * FROM plantoes_entregador WHERE funcionario_id = $1 AND fim IS NULL ORDER BY inicio DESC LIMIT 1',
      [req.funcionarioId]
    );
    if (aberto.rows.length === 0) return res.json(null);

    const resumo = await calcularResumoPlantao(aberto.rows[0].id, req.funcionarioId);
    res.json({ ...aberto.rows[0], ...resumo });
  } catch (error) {
    console.error('Erro ao obter plantao atual:', error);
    res.status(500).json({ erro: 'Erro ao obter plantao atual.' });
  }
}

// Calcula entregas/km/valor de um plantao com base nas entregas concluidas
// vinculadas a ele (pedidos.plantao_id), usando a forma de pagamento
// configurada para o entregador no momento do calculo.
async function calcularResumoPlantao(plantaoId, funcionarioId) {
  const funcionario = await query(
    'SELECT forma_pagamento_entrega, valor_por_entrega, valor_por_km FROM funcionarios WHERE id = $1',
    [funcionarioId]
  );
  const f = funcionario.rows[0] || {};

  const entregas = await query(
    `SELECT COUNT(*) AS total_entregas, COALESCE(SUM(distancia_km), 0) AS total_km,
            COALESCE(SUM(gorjeta), 0) AS total_gorjetas
     FROM pedidos WHERE plantao_id = $1 AND status_pedido = 'entregue'`,
    [plantaoId]
  );
  const totalEntregas = parseInt(entregas.rows[0].total_entregas, 10) || 0;
  const totalKm = Number(entregas.rows[0].total_km) || 0;
  const totalGorjetas = Number(entregas.rows[0].total_gorjetas) || 0;

  const valorComissao = f.forma_pagamento_entrega === 'km'
    ? totalKm * (Number(f.valor_por_km) || 0)
    : totalEntregas * (Number(f.valor_por_entrega) || 0);

  // Valor so da ULTIMA entrega concluida (comissao dela + a caixinha dela),
  // separado do total acumulado do plantao -- usado no card "valor da
  // ultima rota" do app.
  const ultima = await query(
    `SELECT gorjeta, distancia_km FROM pedidos
     WHERE plantao_id = $1 AND status_pedido = 'entregue'
     ORDER BY horario_entregue DESC LIMIT 1`,
    [plantaoId]
  );
  let valorUltimaRota = null;
  if (ultima.rows.length > 0) {
    const u = ultima.rows[0];
    const comissaoUltima = f.forma_pagamento_entrega === 'km'
      ? (Number(u.distancia_km) || 0) * (Number(f.valor_por_km) || 0)
      : (Number(f.valor_por_entrega) || 0);
    valorUltimaRota = comissaoUltima + (Number(u.gorjeta) || 0);
  }

  return {
    total_entregas: totalEntregas,
    total_km: totalKm,
    total_gorjetas: totalGorjetas,
    valor_comissao: valorComissao,
    valor_total: valorComissao + totalGorjetas, // o que o entregador recebe no total: comissao + caixinha
    valor_ultima_rota: valorUltimaRota,
    forma_pagamento_entrega: f.forma_pagamento_entrega,
    valor_por_entrega: f.valor_por_entrega,
    valor_por_km: f.valor_por_km
  };
}

// Encerra o plantao aberto do entregador, grava os totais finais e devolve
// o resumo pra tela de "fim de expediente" do app.
async function encerrarPlantao(req, res) {
  try {
    const aberto = await query(
      'SELECT id FROM plantoes_entregador WHERE funcionario_id = $1 AND fim IS NULL ORDER BY inicio DESC LIMIT 1',
      [req.funcionarioId]
    );
    if (aberto.rows.length === 0) return res.status(404).json({ erro: 'Nenhum plantao aberto no momento.' });

    const plantaoId = aberto.rows[0].id;
    const resumo = await calcularResumoPlantao(plantaoId, req.funcionarioId);

    const fechado = await query(
      `UPDATE plantoes_entregador SET fim = NOW(), total_entregas = $1, total_km = $2, valor_total = $3, total_gorjetas = $4
       WHERE id = $5 RETURNING *`,
      [resumo.total_entregas, resumo.total_km, resumo.valor_total, resumo.total_gorjetas, plantaoId]
    );

    res.json(fechado.rows[0]);
  } catch (error) {
    console.error('Erro ao encerrar plantao:', error);
    res.status(500).json({ erro: 'Erro ao encerrar plantao.' });
  }
}

// Historico de plantoes do PROPRIO entregador (usado no painel/menu lateral
// do app dele -- "rotas realizadas" e "valores a receber"). Diferente de
// listarHistoricoPlantoes (visao do admin), esse so mostra o que e do
// funcionario logado, sem precisar de permissao de gestor.
async function meuHistoricoPlantoes(req, res) {
  try {
    const plantoes = await query(
      `SELECT id, inicio, fim, total_entregas, total_km, valor_total, total_gorjetas
       FROM plantoes_entregador
       WHERE funcionario_id = $1 AND fim IS NOT NULL
       ORDER BY fim DESC
       LIMIT 60`,
      [req.funcionarioId]
    );

    const resumo = await query(
      `SELECT COUNT(*) AS total_plantoes, COALESCE(SUM(total_entregas), 0) AS total_entregas,
              COALESCE(SUM(valor_total), 0) AS valor_total, COALESCE(SUM(total_gorjetas), 0) AS total_gorjetas
       FROM plantoes_entregador WHERE funcionario_id = $1 AND fim IS NOT NULL`,
      [req.funcionarioId]
    );

    res.json({
      plantoes: plantoes.rows,
      resumo: {
        total_plantoes: parseInt(resumo.rows[0].total_plantoes, 10) || 0,
        total_entregas: parseInt(resumo.rows[0].total_entregas, 10) || 0,
        // valor_total ja inclui comissao + caixinha (ver calcularResumoPlantao)
        valor_total: Number(resumo.rows[0].valor_total) || 0,
        total_gorjetas: Number(resumo.rows[0].total_gorjetas) || 0
      }
    });
  } catch (error) {
    console.error('Erro ao obter meu historico de plantoes:', error);
    res.status(500).json({ erro: 'Erro ao obter historico de plantoes.' });
  }
}

// Historico de plantoes -- painel admin. Sem funcionario_id, traz de todos
// os entregadores (ex: fechamento semanal); com funcionario_id, filtra um so.
async function listarHistoricoPlantoes(req, res) {
  try {
    const { funcionario_id, limite } = req.query;
    let sql = `
      SELECT p.*, f.nome AS funcionario_nome
      FROM plantoes_entregador p
      JOIN funcionarios f ON f.id = p.funcionario_id
      WHERE p.estabelecimento_id = $1 AND p.fim IS NOT NULL`;
    const params = [req.estabelecimentoId];

    if (funcionario_id) {
      params.push(funcionario_id);
      sql += ` AND p.funcionario_id = $${params.length}`;
    }
    sql += ' ORDER BY p.fim DESC';

    const limiteFinal = Math.min(parseInt(limite, 10) || 30, 100);
    params.push(limiteFinal);
    sql += ` LIMIT $${params.length}`;

    const resultado = await query(sql, params);
    res.json(resultado.rows);
  } catch (error) {
    console.error('Erro ao listar historico de plantoes:', error);
    res.status(500).json({ erro: 'Erro ao listar historico de plantoes.' });
  }
}

module.exports = {
  loginFuncionario, acessarPorLink, listar, criar, atualizar, atualizarCadastroCompleto, trocarSenha, excluir,
  listarEquipeOperacional, alternarDisponibilidadeEntregador,
  obterQrcodeDoDia, checkinEntregador, exigirDentroDoHorario, liberarHoraExtra, gerarQrcodeGenerico,
  obterPlantaoAtual, encerrarPlantao, listarHistoricoPlantoes, meuHistoricoPlantoes, calcularResumoPlantao,
  registrarAuditoria, PERMISSOES_VALIDAS, CARGOS_VALIDOS
};
