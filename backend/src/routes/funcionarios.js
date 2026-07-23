const express = require('express');
const router = express.Router();
const funcionarioController = require('../controllers/funcionarioController');
const clienteController = require('../controllers/clienteController');
const { autenticarFuncionario, exigirPermissao, exigirCargoAdministrativo } = require('../middlewares/autorizacao');

// Login de funcionario (publico)
router.post('/login', funcionarioController.loginFuncionario);

router.use(autenticarFuncionario);

// Funcionarios
router.get('/', exigirPermissao('gerenciar_funcionarios'), funcionarioController.listar);
router.post('/', exigirPermissao('gerenciar_funcionarios'), funcionarioController.criar);
router.put('/:id', exigirPermissao('editar_funcionarios'), funcionarioController.atualizar);
router.put('/:id/cadastro-completo', exigirCargoAdministrativo, funcionarioController.atualizarCadastroCompleto);
router.delete('/:id', exigirPermissao('gerenciar_funcionarios'), funcionarioController.excluir);

// Equipe operacional (aba "Equipe"): cozinha, entregadores (com fila de
// atribuicao automatica) e atendimento.
router.get('/equipe', exigirPermissao('gerenciar_funcionarios'), funcionarioController.listarEquipeOperacional);

// Disponibilidade do entregador pra fila de atribuicao automatica: o
// controller ja verifica se e o proprio entregador ou quem tem a
// permissao 'gerenciar_funcionarios', entao nao ha checagem de permissao aqui.
router.put('/:id/disponibilidade', funcionarioController.alternarDisponibilidadeEntregador);

// Trocar senha: cada funcionario pode trocar a propria (verificado dentro do
// controller); para trocar a de outro, precisa da permissao 'editar_funcionarios'.
router.put('/:id/senha', (req, res, next) => {
  if (req.funcionarioId && req.funcionarioId === req.params.id) return next();
  return exigirPermissao('editar_funcionarios')(req, res, next);
}, funcionarioController.trocarSenha);

// Clientes (ligado a quem pode criar pedidos, ja que cadastro de cliente
// normalmente acontece junto de um pedido por telefone/balcao)
router.get('/clientes', exigirPermissao('criar_pedidos'), clienteController.listar);
router.get('/clientes/telefone/:telefone', exigirPermissao('criar_pedidos'), clienteController.buscarPorTelefone);
router.post('/clientes', exigirPermissao('criar_pedidos'), clienteController.criarOuAtualizar);
router.put('/clientes/:id', exigirPermissao('criar_pedidos'), clienteController.atualizar);

// Auditoria (mesma permissao de quem gerencia funcionarios, por ser dado sensivel)
router.get('/auditoria', exigirPermissao('gerenciar_funcionarios'), clienteController.listarAuditoria);

module.exports = router;
