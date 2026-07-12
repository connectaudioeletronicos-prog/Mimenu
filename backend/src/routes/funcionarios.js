const express = require('express');
const router = express.Router();
const funcionarioController = require('../controllers/funcionarioController');
const clienteController = require('../controllers/clienteController');
const { autenticarFuncionario, soAdmin, adminOuGerente, adminGerenteOuAtendente, todos } = require('../middlewares/autorizacao');

// Login de funcionario (publico)
router.post('/login', funcionarioController.loginFuncionario);

// Funcionarios (so admin)
router.get('/', autenticarFuncionario, soAdmin, funcionarioController.listar);
router.post('/', autenticarFuncionario, soAdmin, funcionarioController.criar);
router.put('/:id', autenticarFuncionario, soAdmin, funcionarioController.atualizar);
router.put('/:id/senha', autenticarFuncionario, autenticarFuncionario, funcionarioController.trocarSenha);

// Clientes (admin, gerente e atendente)
router.get('/clientes', autenticarFuncionario, adminGerenteOuAtendente, clienteController.listar);
router.get('/clientes/telefone/:telefone', autenticarFuncionario, adminGerenteOuAtendente, clienteController.buscarPorTelefone);
router.post('/clientes', autenticarFuncionario, adminGerenteOuAtendente, clienteController.criarOuAtualizar);
router.put('/clientes/:id', autenticarFuncionario, adminGerenteOuAtendente, clienteController.atualizar);

// Auditoria (so admin)
router.get('/auditoria', autenticarFuncionario, soAdmin, clienteController.listarAuditoria);

module.exports = router;
