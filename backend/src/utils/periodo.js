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
// ===================================================================

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
  const agora = new Date();

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
      return { inicio: inicioDoDia(dataInicioPersonalizada), fim: fimDoDia(dataFimPersonalizada) };
    }

    // "geral": sem limite nenhum de data -- historico completo desde o
    // inicio da loja. Usado quando o proprietario/gerente quer ver tudo.
    case 'geral':
      return { inicio: null, fim: null };

    case 'hoje':
    default:
      return { inicio: inicioDoDia(agora), fim: fimDoDia(agora) };
  }
}

module.exports = { resolverIntervalo };
