// Extrai o resumo que o próprio veículo publicou sobre a matéria.
//
// Regra da casa: resumo é SEMPRE texto literal da fonte — a linha fina que
// o veículo põe na og:description da página. Nada aqui escreve, condensa ou
// parafraseia notícia. Quando não há resumo publicado, o item fica sem
// resumo e a página diz isso, porque um resumo inventado sobre deferimento
// de RJ ou tese do STJ é pior do que resumo nenhum.

import { limparTexto } from './rss.mjs';

const MIN_CARACTERES = 60;
const MAX_CARACTERES = 320;

// Texto que aparece no lugar da linha fina e não descreve a matéria.
const ENTULHO = [
  /assine|assinatura|seja um assinante/i,
  /aceit\w+ os cookies|pol[íi]tica de privacidade/i,
  /voc[êe] atingiu o limite|conte[úu]do exclusivo para/i,
  /ative o javascript|habilite o javascript/i,
  /todos os direitos reservados/i,
  /^(home|not[íi]cias|[úu]ltimas not[íi]cias)$/i,
  /faça seu login|entre na sua conta/i,
];

function conteudoDaMeta(html, atributo, valor) {
  // A ordem dos atributos varia entre veículos, então tenta os dois sentidos.
  const padroes = [
    new RegExp(`<meta[^>]*${atributo}=["']${valor}["'][^>]*content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*${atributo}=["']${valor}["']`, 'i'),
  ];
  for (const padrao of padroes) {
    const achado = html.match(padrao);
    if (achado) return limparTexto(achado[1]);
  }
  return '';
}

function primeiroParagrafo(html) {
  // Fora de script/style, e só parágrafos com corpo de texto de verdade.
  const corpo = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ');
  for (const achado of corpo.matchAll(/<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/gi)) {
    const texto = limparTexto(achado[1]);
    if (texto.length >= MIN_CARACTERES && !ehEntulho(texto)) return texto;
  }
  return '';
}

export function ehEntulho(texto = '') {
  return ENTULHO.some((padrao) => padrao.test(texto));
}

function aparar(texto) {
  if (texto.length <= MAX_CARACTERES) return texto;
  // Corta na fronteira de frase mais próxima para não terminar no meio.
  const cortado = texto.slice(0, MAX_CARACTERES);
  const ponto = cortado.lastIndexOf('. ');
  return ponto > MAX_CARACTERES * 0.6 ? cortado.slice(0, ponto + 1) : `${cortado.trimEnd()}…`;
}

/**
 * Lê o resumo publicado pelo veículo na página da matéria.
 * @returns {{texto:string, origem:string}|null} null quando não há resumo real.
 */
export function extrairResumo(html = '', titulo = '') {
  const candidatos = [
    ['og:description', conteudoDaMeta(html, 'property', 'og:description')],
    ['twitter:description', conteudoDaMeta(html, 'name', 'twitter:description')],
    ['meta description', conteudoDaMeta(html, 'name', 'description')],
    ['primeiro parágrafo', primeiroParagrafo(html)],
  ];

  const tituloNormalizado = limparTexto(titulo).toLowerCase();

  for (const [origem, texto] of candidatos) {
    if (!texto || texto.length < MIN_CARACTERES) continue;
    if (ehEntulho(texto)) continue;
    // Repetir a manchete não é resumo: não acrescenta nada a quem já a leu.
    if (texto.toLowerCase() === tituloNormalizado) continue;
    return { texto: aparar(texto), origem };
  }

  return null;
}

/**
 * A description que veio no feed serve como resumo?
 * O Google Notícias entrega uma lista de links no lugar da linha fina, e
 * alguns portais repetem a manchete. Nos dois casos, não serve.
 */
export function resumoDeFeedServe(resumo = '', titulo = '') {
  if (!resumo || resumo.length < MIN_CARACTERES) return false;
  if (ehEntulho(resumo)) return false;
  if (/news\.google\.com|view full coverage/i.test(resumo)) return false;
  const r = resumo.toLowerCase();
  const t = limparTexto(titulo).toLowerCase();
  if (r === t || r.startsWith(t)) return false;
  return true;
}
