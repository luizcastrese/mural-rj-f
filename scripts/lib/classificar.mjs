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
  'decreta * falencia': 1, 'decretou * falencia': 1, 'convolacao * falencia': 1,
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

// Que fato a manchete narra. É isto que separa "Braskem protocola pedido" de
// "Justiça aprova o pedido da Braskem": os dois falam da mesma empresa, mas
// são etapas diferentes, e cada uma é notícia por si.
const EVENTOS = [
  ['falencia-convolada', /convol|convert\w*\s+(?:\w+\s+)?em\s+falencia/],
  [
    'falencia',
    /falencia\s+decretada|decret\w*\s+(?:\w+\s+)?falencia|decretacao\s+(?:\w+\s+)?falencia|determin\w*\s+(?:\w+\s+)?falencia|declar\w*\s+(?:\w+\s+)?falencia|quebra\s+d/,
  ],
  ['extra-aprovada', /extrajudicial/, /aprov|aceit|autoriz|homolog|aval\b|deferi|avanc|valida/],
  ['extra-pedido', /extrajudicial/, /protocol|pede|pediu|pedido|entra|inicia|iniciou|apresent|submet|recorre|vai usar|negociar|usar/],
  [
    'rj-deferida',
    /deferi\w*\s+(?:\w+\s+)?(?:o\s+)?processamento|processamento\s+(?:\w+\s+)?recuperacao|defer\w+\s+(?:\w+\s+)?recuperacao|aceit\w*\s+(?:\w+\s+)?pedido\s+de\s+recuperacao/,
  ],
  // Concessão do período de blindagem: prazo que o profissional precisa saber.
  ['stay', /\b\d{2,3}\s+dias\b|blindagem|suspensao\s+d\w+\s+execuc|prote\w+\s+(?:\w+\s+)?(?:de\s+)?cobranc/],
  ['plano', /plano|recuperacao/, /aprovad\w*\s+p\w*\s*credores|homolog|rejeit|trava|contest|impugn|objec/],
  ['plano', /plano|recuperacao/, /aprov|vota|assembleia|adita|aditamento|apresent|submet/],
  // Encerrar a recuperação é fato tão noticiável quanto abri-la.
  ['encerramento', /encerr\w*\s+(?:\w+\s+)?recuperacao|sai\w*\s+d\w+\s+recuperacao|extin\w*\s+(?:\w+\s+)?recuperacao|conclui\w*\s+(?:\w+\s+)?recuperacao/],
  ['rj-pedido', /pede|pediu|pedido|entra\w*\s+em\s+recuperacao|entrou\s+em\s+recuperacao|protocol|ajuiz|requer|solicit/],
];

// Quem age e o que faz. Junto, isso é um fato processual sendo noticiado —
// "Juiz determina falência", "Justiça protege de cobranças", "MP contesta o
// plano" — e não comentário sobre o caso.
const AGENTE = /justic|juiz|juiza|tribunal|\bstj\b|\bstf\b|supremo|superior tribunal|\bvara\b|desembargad|ministro|relator|ministerio publico|\bmps?p?\b|credores|assembleia|administrador judicial|\bcnj\b/;
const ATO = /determin|autoriz|nega|negou|concede|concedeu|mantem|manteve|suspend|proteg|manda|obrig|homolog|rejeit|defer|indefer|declar|contest|impugn|habilit|arremat|leilo|prorrog|afast|confirm|restring|limit|valid|veda|admit|reconhec|apresent|submet|convoc|ades|extin/;

export function evento(titulo = '', categoria = '') {
  const texto = normalizar(titulo);
  for (const [nome, padrao, exigeTambem] of EVENTOS) {
    if (!padrao.test(texto)) continue;
    if (exigeTambem && !exigeTambem.test(texto)) continue;
    return nome;
  }
  // Rede final: alguém do processo praticou um ato. Também é fato.
  if (AGENTE.test(texto) && ATO.test(texto)) return 'decisao-processual';
  return `outros:${categoria}`;
}

// Peças que citam insolvência sem noticiar nada: divulgação de curso ou
// evento, e manchete-isca que só promete explicar.
const RUIDO_EDITORIAL = [
  /\b(webinar|congresso|semin[áa]rio|simp[óo]sio|palestra|workshop|curso|p[óo]s-?gradua[çc][ãa]o|mba|inscri[çc][õo]es|matr[íi]culas)\b/i,
  /\b(entenda|saiba|confira|veja) (o que|como|por que|quem|tudo)/i,
  /\bo que (isso )?significa\b|\bo que muda\b|\btudo (o que se )?sabe\b/i,
  /\b\d+ (pontos|coisas|perguntas|d[úu]vidas) (para|sobre)\b/i,
];

// Sinais de que a matéria traz decisão judicial de conteúdo, e não apenas
// menção a tribunal.
const DECISAO_JUDICIAL = compilar({
  stj: 1, stf: 1, 'superior tribunal de justica': 1, 'supremo tribunal federal': 1,
  'recurso repetitivo': 1, 'tema repetitivo': 1, sumula: 1, acordao: 1, tese: 1,
  precedente: 1, jurisprudencia: 1, 'decidiu que': 1, 'entendeu que': 1,
  'fixa tese': 1, 'firmou entendimento': 1, 'conflito de competencia': 1,
  'camara de direito empresarial': 1, 'camara reservada': 1,
});

// Sinais de mudança normativa em curso, não de mera citação da lei.
const MUDANCA_NORMATIVA = compilar({
  'projeto de lei': 1, 'projetos de lei': 1, 'medida provisoria': 1,
  'reforma da lei': 1, sancionada: 1, sancionou: 1, 'entra em vigor': 1,
  'nova lei': 1, tramita: 1, tramitacao: 1, 'camara aprovou': 1,
  'camara aprova': 1, 'senado aprova': 1, 'senado aprovou': 1,
  regulamentacao: 1, 'marco legal': 1, 'audiencia publica': 1,
});

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
  const doTema = nucleo > 0 && !(ruido && !forte);

  let melhor = { id: 'mercado', pontos: 0 };
  for (const categoria of CATEGORIAS) {
    const pontos = somar(texto, categoria.termos);
    if (pontos > melhor.pontos) melhor = { id: categoria.id, pontos };
  }

  // Ser do tema não basta para ocupar espaço no mural. Entra o que noticia um
  // fato: uma etapa do processo, uma decisão com conteúdo, ou uma mudança na
  // lei. Fica de fora o comentário de mercado, a coluna de opinião e a
  // divulgação de curso — que citam insolvência sem informar nada novo.
  const oQueNarra = evento(item.titulo || '', melhor.id);
  const narraFato = !oQueNarra.startsWith('outros:');
  const decideAlgo = melhor.id === 'jurisprudencia' && somar(texto, DECISAO_JUDICIAL) > 0;
  const mudaALei = melhor.id === 'legislacao' && somar(texto, MUDANCA_NORMATIVA) > 0;
  const isca = RUIDO_EDITORIAL.some((padrao) => padrao.test(item.titulo || ''));

  // A isca só derruba quando não há fato: "Oi tem falência decretada; veja o
  // que ocorre agora" noticia a quebra, ainda que embale como explicativo.
  const relevante = doTema && (narraFato || ((decideAlgo || mudaALei) && !isca));

  const etiquetas = ETIQUETAS
    .filter(({ res }) => res.some((re) => re.test(texto)))
    .map(({ nome }) => nome)
    .slice(0, 4);

  return {
    relevante,
    categoria: melhor.id,
    evento: oQueNarra,
    pontuacao: nucleo + melhor.pontos,
    etiquetas,
  };
}
