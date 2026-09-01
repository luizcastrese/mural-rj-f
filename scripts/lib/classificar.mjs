// Decide o que é notícia de insolvência (e de que tipo). O coletor puxa
// muito material genérico de direito e de economia; é aqui que ele vira
// um mural útil para quem atua com RJ e falência.

export function normalizar(texto = '') {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

// Termos com letra/dígito nas pontas ganham \b para não casar dentro de
// outra palavra ("pl" em "plano", "stj" em "stjx").
//
// ' * ' no meio do termo é uma vaga de artigo opcional: 'decreta * falencia'
// casa com "decreta falência", "decreta a falência" e "decreta da falência".
// Sem isso, o termo teria de prever cada artigo — e foi assim que dezenas de
// "Justiça decreta falência do Grupo X" acabaram fora da categoria certa.
const ARTIGO = '\\s+(?:[ao]s?|d[aeo]s?|em|n[ao]s?)?\\s*';

function comoRegex(termo) {
  const escapar = (parte) => parte.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  const corpo = termo.split(' * ').map(escapar).join(ARTIGO);
  const inicio = /[a-z0-9]/.test(termo[0]) ? '\\b' : '';
  const fim = /[a-z0-9]/.test(termo[termo.length - 1]) ? '\\b' : '';
  return new RegExp(inicio + corpo + fim, 'i');
}

function compilar(mapa) {
  return Object.entries(mapa).map(([termo, peso]) => ({ termo, peso, re: comoRegex(termo) }));
}

// Sem pelo menos um destes, a matéria não entra no mural.
const NUCLEO = compilar({
  'recuperacao judicial': 5,
  'recuperacoes judiciais': 5,
  'recuperacao extrajudicial': 5,
  'recuperanda': 5,
  'recuperandas': 5,
  falencia: 4,
  falencias: 4,
  falimentar: 4,
  falida: 4,
  'insolvencia': 4,
  'lei 11.101': 5,
  'lei 14.112': 5,
  'administrador judicial': 5,
  'plano de recuperacao': 5,
  'assembleia geral de credores': 5,
  'concurso de credores': 4,
  'juizo universal': 4,
  'stay period': 4,
  'soerguimento': 3,
});

// "Falência" também é metáfora e termo médico. Se o texto só tem isso e
// nada de insolvência empresarial, fica de fora.
const FALSOS_POSITIVOS = [
  'falencia multipla', 'falencia de multiplos orgaos', 'falencia renal',
  'falencia cardiaca', 'falencia respiratoria', 'falencia hepatica',
  'falencia medular', 'falencia ovariana', 'falencia terapeutica',
  'falencia moral', 'falencia da seguranca', 'falencia do estado',
  'falencia da politica', 'falencia da educacao', 'falencia escolar',
].map(comoRegex);

// Só estes seguram uma matéria sozinhos contra a lista acima.
const NUCLEO_FORTE = compilar({
  'recuperacao judicial': 1, 'recuperacoes judiciais': 1, 'recuperacao extrajudicial': 1,
  'recuperanda': 1, 'lei 11.101': 1, 'lei 14.112': 1, 'administrador judicial': 1,
  'plano de recuperacao': 1, 'massa falida': 1, 'falencia decretada': 1,
  'pedido de falencia': 1, 'insolvencia empresarial': 1, 'juizo universal': 1,
});

export const CATEGORIAS = [
  {
    id: 'novas-rjs',
    nome: 'Novos casos',
    descricao: 'Pedidos, deferimentos e recuperações extrajudiciais',
    termos: compilar({
      'deferimento * processamento': 9,
      'defere * processamento': 9,
      'deferiu * processamento': 9,
      'deferir * processamento': 8,
      'processamento * recuperacao': 8,
      'recuperacao judicial deferida': 8,
      'tem recuperacao judicial deferida': 8,
      'defere * recuperacao': 8,
      'deferiu * recuperacao': 8,
      'pedido de recuperacao judicial': 7,
      'pede * recuperacao judicial': 7,
      'pediu * recuperacao judicial': 7,
      'pedir * recuperacao judicial': 6,
      'entra em recuperacao judicial': 7,
      'entrou em recuperacao judicial': 7,
      'entram em recuperacao judicial': 7,
      'ajuizou * recuperacao': 6,
      'ajuiza * recuperacao': 6,
      'ingressou com pedido': 5,
      'protocolou pedido': 5,
      'requereu recuperacao': 6,
      'obtem recuperacao judicial': 7,
      'obteve recuperacao judicial': 7,
      'concede recuperacao judicial': 7,
      'concedida a recuperacao judicial': 7,
      'aceita pedido de recuperacao': 7,
      // A extrajudicial é o mesmo tipo de evento: caso novo entrando.
      'pedido de recuperacao extrajudicial': 8,
      'protocola * recuperacao extrajudicial': 8,
      'protocolou * recuperacao extrajudicial': 8,
      'aceita * recuperacao extrajudicial': 8,
      'aceitou * recuperacao extrajudicial': 8,
      'aprova * recuperacao extrajudicial': 8,
      'aprovou * recuperacao extrajudicial': 8,
      'homologa * recuperacao extrajudicial': 8,
      'homologou * recuperacao extrajudicial': 8,
      'deferida * recuperacao extrajudicial': 8,
      'aval * justica para recuperacao extrajudicial': 8,
      'entra * recuperacao extrajudicial': 7,
      'em recuperacao judicial': 2,
    }),
  },
  {
    id: 'falencias',
    nome: 'Falências',
    descricao: 'Quebras decretadas, convolações e massas falidas',
    termos: compilar({
      'falencia decretada': 9,
      'decreta * falencia': 9,
      'decretou * falencia': 9,
      'decretar * falencia': 8,
      'decretada * falencia': 8,
      'decretacao * falencia': 9,
      'convolacao * falencia': 9,
      'convolada * falencia': 9,
      'convolou * falencia': 9,
      'convertida * falencia': 8,
      'tem * falencia': 7,
      'teve * falencia': 7,
      autofalencia: 8,
      'pedido de falencia': 6,
      'massa falida': 5,
      'quebra da empresa': 5,
      falimentar: 2,
    }),
  },
  {
    id: 'jurisprudencia',
    nome: 'Jurisprudência',
    descricao: 'O que os tribunais vêm decidindo',
    termos: compilar({
      'recurso repetitivo': 10,
      'tema repetitivo': 10,
      'recursos repetitivos': 10,
      sumula: 8,
      stj: 8,
      'superior tribunal de justica': 8,
      stf: 7,
      'supremo tribunal federal': 7,
      acordao: 6,
      jurisprudencia: 6,
      precedente: 5,
      'tribunal de justica': 4,
      tjsp: 4,
      tjrj: 4,
      'agravo de instrumento': 5,
      'conflito de competencia': 6,
      'embargos de declaracao': 4,
      'decidiu que': 3,
      'entendeu que': 3,
      relator: 3,
      ministro: 2,
      turma: 2,
      'camara reservada': 5,
      'camara de direito empresarial': 6,
    }),
  },
  {
    id: 'legislacao',
    nome: 'Legislação',
    descricao: 'Projetos, reformas e regulamentação',
    termos: compilar({
      'reforma da lei de falencias': 10,
      'reforma da lei': 8,
      'projeto de lei': 8,
      'projetos de lei': 8,
      'medida provisoria': 7,
      'camara dos deputados': 6,
      'senado federal': 6,
      'congresso nacional': 6,
      sancionada: 6,
      sancionou: 6,
      'entra em vigor': 6,
      'nova lei': 6,
      tramitacao: 6,
      tramita: 6,
      'audiencia publica': 5,
      'parecer do relator': 5,
      regulamentacao: 5,
      'marco legal': 6,
      'insolvencia transfronteirica': 7,
      'lei 11.101': 2,
      'lei 14.112': 2,
      senado: 4,
      'camara aprovou': 7,
    }),
  },
  {
    id: 'mercado',
    nome: 'Mercado & Casos',
    descricao: 'Andamento de casos, credores e reestruturações',
    termos: compilar({
      credores: 3,
      'assembleia geral de credores': 5,
      agc: 4,
      'plano de recuperacao': 4,
      'homologacao do plano': 6,
      'aprovacao do plano': 6,
      reestruturacao: 4,
      divida: 2,
      'dip financing': 6,
      'venda de ativos': 5,
      'unidade produtiva isolada': 6,
      upi: 5,
    }),
  },
];

// Marcadores temáticos exibidos como etiquetas no card.
const ETIQUETAS = [
  ['STJ', ['stj', 'superior tribunal de justica']],
  ['STF', ['stf', 'supremo tribunal federal']],
  ['Repetitivo', ['recurso repetitivo', 'tema repetitivo', 'recursos repetitivos']],
  ['Stay period', ['stay period', 'suspensao das execucoes', 'blindagem']],
  ['Plano', ['plano de recuperacao', 'homologacao do plano', 'cram down']],
  ['AGC', ['assembleia geral de credores', 'assembleia de credores']],
  ['Administrador judicial', ['administrador judicial']],
  ['Crédito trabalhista', ['credito trabalhista', 'creditos trabalhistas']],
  ['Crédito fiscal', ['credito tributario', 'creditos tributarios', 'transacao tributaria', 'divida fiscal']],
  ['Consolidação', ['consolidacao substancial', 'consolidacao processual']],
  ['DIP', ['dip financing', 'financiamento dip']],
  ['UPI', ['unidade produtiva isolada', 'upi']],
  ['Agronegócio', ['produtor rural', 'agronegocio', 'agro']],
  ['Extrajudicial', ['recuperacao extrajudicial']],
  ['Grupo econômico', ['grupo economico']],
].map(([nome, termos]) => ({ nome, res: termos.map(comoRegex) }));

function somar(texto, termos) {
  let total = 0;
  for (const { re, peso } of termos) if (re.test(texto)) total += peso;
  return total;
}

/**
 * @param {{titulo?:string, resumo?:string}} item
 * @returns {{relevante:boolean, categoria:string, pontuacao:number, etiquetas:string[]}}
 */
export function classificar(item) {
  // O título pesa mais: é onde o fato está, e o resumo costuma ser ruído.
  const titulo = normalizar(item.titulo || '');
  const resumo = normalizar(item.resumo || '');
  const texto = `${titulo} ${titulo} ${resumo}`;

  const nucleo = somar(texto, NUCLEO);
  const forte = NUCLEO_FORTE.some(({ re }) => re.test(texto));
  const ruido = FALSOS_POSITIVOS.some((re) => re.test(texto));
  const relevante = nucleo > 0 && !(ruido && !forte);

  let melhor = { id: 'mercado', pontos: 0 };
  for (const categoria of CATEGORIAS) {
    const pontos = somar(texto, categoria.termos);
    if (pontos > melhor.pontos) melhor = { id: categoria.id, pontos };
  }

  const etiquetas = ETIQUETAS
    .filter(({ res }) => res.some((re) => re.test(texto)))
    .map(({ nome }) => nome)
    .slice(0, 4);

  return {
    relevante,
    categoria: melhor.id,
    pontuacao: nucleo + melhor.pontos,
    etiquetas,
  };
}
