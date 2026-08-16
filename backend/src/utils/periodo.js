// ===================================================================
// Utilitario de resolucao de periodo para relatorios de vendas / caixa
// Caminho no projeto: backend/src/utils/periodo.js
// ===================================================================
// Recebe o parametro "intervalo" e devolve { inicio, fim } como objetos
// Date, prontos para usar num WHERE criado_em BETWEEN inicio AND fim.
//
// Intervalos "moveis" (janela de N dias pra tras, usados pelo modulo de
// Estoque/Inteligencia): 7dias, 15dias, mes, ano.
//
// Intervalos "civis" (calendario real -- semana/mes/trimestre/semestre
// ATUAL, usados pelo Caixa Geral e pelo Resumo do Funcionario): semana,
// mes_atual, trimestre, semestre. Semana comeca na segunda-feira.
//
// "personalizado" usa as datas informadas (manual, do date-picker).
//
// ---------------------------------------------------------------------
// FUSO HORARIO -- MESMO PROBLEMA JA CORRIGIDO EM utils/horario.js:
// O servidor (Render) roda em UTC, mas "hoje" pro dono da loja e sempre
// o dia de Brasilia. Sem esse ajuste, `new Date().setHours(0,0,0,0)`
// calcula a meia-noite no fuso do SERVIDOR -- entao a partir de ~21h em
// Brasilia (que ja e meia-noite em UTC), "hoje" silenciosamente vira
// "ontem" pro banco, e o Resumo do Funcionario / Caixa Geral mostram
// zero mesmo com vendas reais feitas minutos antes. Todo calculo aqui
// agora e feito em cima do relogio de Brasilia, nao do servidor.
// ===================================================================

const FUSO = 'America/Sao_Paulo';
const OFFSET_BRASILIA_MS = 3 * 60 * 60 * 1000; // UTC-3, fixo (Brasil nao tem mais horario de verao desde 2019)

// Converte um instante REAL pra um Date "espelhado": quando os metodos
// locais desse objeto (getHours, getDate, setHours, setDate...) sao
// chamados nele -- no fuso do SERVIDOR -- os valores lidos/escritos sao
// os mesmos que o relogio de pared de Brasilia mostraria pra esse
// instante. Assim a matematica de calendario que ja existia aqui
// (inicioDaSemana, inicioDoMes etc, que so mexem em hora/dia/mes locais)
// continua funcionando sem reescrever, so que agora alinhada ao dia
// certo.
function paraFusoBrasil(dataReal) {
  const offsetServidorMs = dataReal.getTimezoneOffset() * 60000;
  return new Date(dataReal.getTime() - OFFSET_BRASILIA_MS + offsetServidorMs);
}

// Caminho inverso: pega um Date "espelhado" (calculado em cima do fuso
// de Brasilia) e devolve o instante REAL correspondente -- e isso que
// vai pro WHERE do banco (timestamps do Postgres sao sempre reais/UTC).
function deFusoBrasil(dataEspelhada) {
  const offsetServidorMs = dataEspelhada.getTimezoneOffset() * 60000;
  return new Date(dataEspelhada.getTime() + OFFSET_BRASILIA_MS - offsetServidorMs);
}

function inicioDoDia(data) {
  const d = new Date(data);
  d.setHours(0, 0, 0, 0);
  return d;
}

function fimDoDia(data) {
  const d = new Date(data);
  d.setHours(23, 59, 59, 999);
  return d;
}

// Segunda-feira da semana de "data" (getDay(): 0=domingo...6=sabado).
function inicioDaSemana(data) {
  const d = new Date(data);
  const diaSemana = d.getDay();
  const deslocamento = diaSemana === 0 ? -6 : 1 - diaSemana; // domingo volta 6 dias, resto volta ate a segunda
  d.setDate(d.getDate() + deslocamento);
  return inicioDoDia(d);
}

function inicioDoMes(data) {
  const d = new Date(data);
  d.setDate(1);
  return inicioDoDia(d);
}

// Primeiro dia do trimestre civil atual (jan/abr/jul/out).
function inicioDoTrimestre(data) {
  const d = new Date(data);
  const mesDoTrimestre = Math.floor(d.getMonth() / 3) * 3;
  d.setMonth(mesDoTrimestre, 1);
  return inicioDoDia(d);
}

// Primeiro dia do semestre civil atual (jan ou jul).
function inicioDoSemestre(data) {
  const d = new Date(data);
  const mesDoSemestre = d.getMonth() < 6 ? 0 : 6;
  d.setMonth(mesDoSemestre, 1);
  return inicioDoDia(d);
}

function resolverIntervalo(intervalo, dataInicioPersonalizada, dataFimPersonalizada) {
  // "agora" espelhado no fuso de Brasilia -- toda a matematica de
  // calendario abaixo (dia/semana/mes/trimestre/semestre) usa essa
  // versao, nunca o Date() cru do servidor.
  const agora = paraFusoBrasil(new Date());

  const resultado = (() => {
    switch (intervalo) {
      case 'ontem': {
        const ontem = new Date(agora);
        ontem.setDate(ontem.getDate() - 1);
        return { inicio: inicioDoDia(ontem), fim: fimDoDia(ontem) };
      }

      // --- Janelas moveis (ultimos N dias) -- mantidas pro modulo de Estoque ---
      case '7dias': {
        const inicio = new Date(agora);
        inicio.setDate(inicio.getDate() - 6);
        return { inicio: inicioDoDia(inicio), fim: fimDoDia(agora) };
      }
      case '15dias': {
        const inicio = new Date(agora);
        inicio.setDate(inicio.getDate() - 14);
        return { inicio: inicioDoDia(inicio), fim: fimDoDia(agora) };
      }
      case 'mes': {
        const inicio = new Date(agora);
        inicio.setDate(inicio.getDate() - 29);
        return { inicio: inicioDoDia(inicio), fim: fimDoDia(agora) };
      }
      case 'ano': {
        const inicio = new Date(agora);
        inicio.setDate(inicio.getDate() - 364);
        return { inicio: inicioDoDia(inicio), fim: fimDoDia(agora) };
      }

      // --- Periodos de calendario real (Caixa Geral / Resumo do Funcionario) ---
      case 'semana':
        return { inicio: inicioDaSemana(agora), fim: fimDoDia(agora) };
      case 'mes_atual':
        return { inicio: inicioDoMes(agora), fim: fimDoDia(agora) };
      case 'trimestre':
        return { inicio: inicioDoTrimestre(agora), fim: fimDoDia(agora) };
      case 'semestre':
        return { inicio: inicioDoSemestre(agora), fim: fimDoDia(agora) };

      case 'personalizado': {
        if (!dataInicioPersonalizada || !dataFimPersonalizada) {
          return { inicio: inicioDoDia(agora), fim: fimDoDia(agora) };
        }
        // Datas digitadas no date-picker (ex: "2026-08-01") representam
        // um dia de calendario em Brasilia, nao em UTC -- passam pelo
        // mesmo espelhamento antes de virar inicio/fim do dia.
        return {
          inicio: inicioDoDia(paraFusoBrasil(new Date(`${dataInicioPersonalizada}T00:00:00`))),
          fim: fimDoDia(paraFusoBrasil(new Date(`${dataFimPersonalizada}T00:00:00`)))
        };
      }

      // "geral": sem limite nenhum de data -- historico completo desde o
      // inicio da loja. Usado quando o proprietario/gerente quer ver tudo.
      case 'geral':
        return { inicio: null, fim: null };

      case 'hoje':
      default:
        return { inicio: inicioDoDia(agora), fim: fimDoDia(agora) };
    }
  })();

  return {
    inicio: resultado.inicio ? deFusoBrasil(resultado.inicio) : null,
    fim: resultado.fim ? deFusoBrasil(resultado.fim) : null
  };
}

module.exports = { resolverIntervalo, FUSO };
