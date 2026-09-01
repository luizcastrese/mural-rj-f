// Junta a mesma notícia publicada por vários veículos.
//
// Um deferimento de RJ relevante sai em dez portais no mesmo dia, cada um com
// a manchete um pouco diferente — a deduplicação por título exato não pega
// isso, e o mural repete a mesma notícia dez vezes. Aqui elas viram um card
// só, e o número de veículos que a cobriram passa a ser informação útil:
// notícia em dez lugares é notícia grande.

import { normalizar } from './classificar.mjs';

// Palavras que aparecem em quase toda manchete do tema e por isso não
// distinguem uma notícia da outra. Os VERBOS ficam de fora desta lista de
// propósito: é "pede" contra "sai", "aprova" contra "rejeita", que separa um
// evento do outro. Tirá-los daqui fundia notícias distintas da mesma empresa.
const VAZIAS = new Set([
  'recuperacao', 'judicial', 'extrajudicial', 'falencia', 'falencias', 'justica',
  'empresa', 'empresas', 'grupo', 'grupos', 'tribunal', 'processo', 'credores',
  'apos', 'sobre', 'para', 'como', 'contra', 'ainda', 'pelo', 'pela', 'pelos',
  'seus', 'suas', 'este', 'esta', 'isso', 'mais', 'menos', 'ante', 'anos', 'dias',
  'milhoes', 'milhao', 'bilhao', 'bilhoes', 'entenda', 'saiba', 'veja',
]);

// Radical curto: "decreta" e "decretada" são o mesmo evento e precisam casar.
// Seis caracteres bastam para o português das manchetes, sem juntar palavras
// de sentidos diferentes.
const RADICAL = 6;

// Palavras que começam com maiúscula mas não são a empresa da notícia:
// instituições, praças e rótulos de manchete.
const NAO_E_EMPRESA = new Set([
  'justica', 'tribunal', 'stj', 'stf', 'tjsp', 'tjrj', 'supremo', 'superior',
  'ministerio', 'publico', 'vara', 'camara', 'senado', 'congresso', 'lei',
  'estado', 'federal', 'republica', 'uniao', 'brasil', 'brasileira', 'brasileiro',
  'rio', 'janeiro', 'sao', 'paulo', 'minas', 'gerais', 'bahia', 'parana', 'ceara',
  'porto', 'alegre', 'belo', 'horizonte', 'salvador', 'recife', 'fortaleza',
  'pernambuco', 'goias', 'santa', 'catarina', 'grande', 'norte', 'sul', 'distrito',
  'grupo', 'empresa', 'companhia', 'holding', 'banco', 'entenda', 'veja', 'saiba',
  'exclusivo', 'apos', 'com', 'sem', 'nova', 'novo', 'dona', 'dono', 'juiz', 'juiza',
  'recuperacao', 'falencia', 'judicial', 'extrajudicial', 'ele', 'ela',
]);

// Nome próprio na manchete: em português é o que vem em maiúscula.
export function empresas(titulo = '') {
  const encontradas = titulo
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((palavra) => /^\p{Lu}/u.test(palavra))
    .map((palavra) => normalizar(palavra))
    .filter((palavra) => palavra.length >= 3 && !NAO_E_EMPRESA.has(palavra));
  return new Set(encontradas);
}

// Que fato a manchete narra. É isto que separa "Braskem protocola pedido" de
// "Justiça aprova o pedido da Braskem": os dois falam da mesma empresa, mas
// são etapas diferentes, e cada uma é notícia por si.
const EVENTOS = [
  ['falencia-convolada', /convol|convert\w*\s+(?:\w+\s+)?em\s+falencia/],
  ['falencia', /falencia\s+decretada|decret\w*\s+(?:\w+\s+)?falencia|decretacao\s+(?:\w+\s+)?falencia|quebra\s+d/],
  ['extra-aprovada', /extrajudicial/, /aprov|aceit|autoriz|homolog|aval\b|deferi|avanc|valida/],
  ['extra-pedido', /extrajudicial/, /protocol|pede|pediu|pedido|entra|apresent|recorre|vai usar|negociar|usar/],
  ['rj-deferida', /deferi\w*\s+(?:\w+\s+)?(?:o\s+)?processamento|processamento\s+(?:\w+\s+)?recuperacao|defer\w+\s+(?:\w+\s+)?recuperacao|aceit\w*\s+(?:\w+\s+)?pedido\s+de\s+recuperacao/],
  ['rj-pedido', /pede|pediu|pedido|entra\w*\s+em\s+recuperacao|entrou\s+em\s+recuperacao|protocol|ajuiz|requer|solicit/],
  ['plano', /plano/, /aprov|homolog|rejeit|vota/],
];

export function evento(titulo = '', categoria = '') {
  const texto = normalizar(titulo);
  for (const [nome, padrao, exigeTambem] of EVENTOS) {
    if (!padrao.test(texto)) continue;
    if (exigeTambem && !exigeTambem.test(texto)) continue;
    return nome;
  }
  return `outros:${categoria}`;
}

const JANELA_MS = 5 * 24 * 60 * 60 * 1000;
// 0,55 foi calibrado sobre a coleta real: agrupa as manchetes do mesmo fato
// sem fundir eventos distintos da mesma empresa, que ficam por volta de 0,5.
const LIMIAR = 0.55;

export function marcadores(titulo = '') {
  return new Set(
    normalizar(titulo)
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((palavra) => palavra.length >= 4 && !VAZIAS.has(palavra))
      .map((palavra) => palavra.slice(0, RADICAL)),
  );
}

export function semelhanca(a, b) {
  // Manchete curta demais não dá base para afirmar que é a mesma notícia.
  if (a.size < 2 || b.size < 2) return 0;
  let comuns = 0;
  for (const palavra of a) if (b.has(palavra)) comuns += 1;
  return comuns / (a.size + b.size - comuns);
}

function cruzam(a, b) {
  for (const nome of a) if (b.has(nome)) return true;
  return false;
}

// Mesma empresa + mesma etapa + mesma semana = mesma notícia, ainda que
// escrita com outras palavras. Fora disso, cai na sobreposição de palavras,
// que cobre as manchetes sem nome próprio identificável.
function mesmaHistoria(perfil, grupo) {
  if (Math.abs(perfil.quando - grupo.quando) > JANELA_MS) return false;

  const eventoEspecifico = !perfil.evento.startsWith('outros:');
  if (
    eventoEspecifico &&
    perfil.evento === grupo.evento &&
    cruzam(perfil.empresas, grupo.empresas)
  ) {
    return true;
  }

  return semelhanca(perfil.marcas, grupo.marcas) >= LIMIAR;
}

function quandoEm(noticia) {
  return new Date(noticia.data || noticia.coletadoEm || 0).getTime();
}

// Melhor representante do grupo: o card que tem resumo vence, porque é o que
// poupa o leitor de abrir a matéria. Depois, maior pontuação e mais recente.
function melhorQue(candidato, atual) {
  if (Boolean(candidato.resumo) !== Boolean(atual.resumo)) return Boolean(candidato.resumo);
  if (candidato.pontuacao !== atual.pontuacao) return candidato.pontuacao > atual.pontuacao;
  return quandoEm(candidato) > quandoEm(atual);
}

/**
 * Marca cada notícia com o grupo a que pertence. O representante recebe
 * principal: true, cobertura (quantos veículos) e tambemEm (os outros).
 */
export function agrupar(noticias) {
  const grupos = [];

  for (const noticia of noticias) {
    const perfil = {
      marcas: marcadores(noticia.titulo),
      empresas: empresas(noticia.titulo),
      evento: evento(noticia.titulo, noticia.categoria),
      quando: quandoEm(noticia),
    };

    const grupo = grupos.find((g) => mesmaHistoria(perfil, g));

    if (grupo) {
      grupo.itens.push(noticia);
      if (melhorQue(noticia, grupo.representante)) grupo.representante = noticia;
    } else {
      grupos.push({ id: `g${grupos.length}`, ...perfil, itens: [noticia], representante: noticia });
    }
  }

  return noticias.map((noticia) => {
    const grupo = grupos.find((g) => g.itens.includes(noticia));
    const principal = grupo.representante === noticia;
    const outros = [
      ...new Set(grupo.itens.filter((i) => i !== noticia).map((i) => i.veiculo).filter(Boolean)),
    ];
    return {
      ...noticia,
      grupo: grupo.id,
      principal,
      ...(principal && outros.length ? { cobertura: grupo.itens.length, tambemEm: outros } : {}),
    };
  });
}
