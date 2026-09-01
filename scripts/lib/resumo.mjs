// Extrai o resumo que o próprio veículo publicou sobre a matéria.
//
// Regra da casa: o resumo é montado com frases da própria matéria. Ou é a
// linha fina que o veículo publicou, ou são as primeiras frases do texto,
// reproduzidas como estão. Nada aqui parafraseia, interpreta ou completa
// lacuna: cada palavra do resumo saiu da notícia. Quando a matéria não é
// alcançável, o item fica sem resumo e a página diz isso — um resumo
// inventado sobre deferimento de RJ ou tese do STJ é pior do que nenhum.

import { limparTexto } from './rss.mjs';

const MIN_CARACTERES = 60;
const MAX_CARACTERES = 320;
// Alvo do resumo montado com frases da matéria: o bastante para dizer o que
// aconteceu, sem virar leitura longa.
const MIN_RESUMO_MONTADO = 200;

// Texto que aparece no lugar da linha fina e não descreve a matéria.
const ENTULHO = [
  /assine|assinatura|seja um assinante/i,
  /aceit\w+ os cookies|pol[íi]tica de privacidade/i,
  /voc[êe] atingiu o limite|conte[úu]do exclusivo para/i,
  /ative o javascript|habilite o javascript/i,
  /todos os direitos reservados/i,
  /^(home|not[íi]cias|[úu]ltimas not[íi]cias)$/i,
  /faça seu login|entre na sua conta/i,
  // Texto institucional do próprio Google Notícias: o link do feed leva à
  // página de redirecionamento dele, não à matéria. Copiar isso encheria o
  // mural de "resumos" que não falam da notícia.
  /aggregated from sources all over the world/i,
  /comprehensive up-to-date news coverage/i,
  /google (?:news|notícias)/i,
  /read full articles|view full coverage/i,
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

// Isola o corpo da matéria antes de ler os parágrafos: sem script, estilo,
// legenda de foto e caixa lateral, que não fazem parte do texto.
function corpoDaMateria(html) {
  const artigo = html.match(/<article(?:\s[^>]*)?>([\s\S]*?)<\/article>/i);
  return (artigo ? artigo[1] : html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<figure[\s\S]*?<\/figure>/gi, ' ')
    .replace(/<figcaption[\s\S]*?<\/figcaption>/gi, ' ')
    .replace(/<aside[\s\S]*?<\/aside>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ');
}

// Chamadas e rótulos que aparecem no meio do texto e não são a notícia.
const NAO_E_TEXTO = /^(leia|veja|assista|siga|compartilhe|confira|foto|imagem|publicidade|continua|com informa|por |atualizado em|fonte:)/i;

/**
 * Monta o resumo com as primeiras frases da matéria, reproduzidas como
 * estão. É o texto do veículo, apenas recortado no ponto final.
 * @returns {{texto:string, origem:string}|null}
 */
export function resumoDoCorpo(html = '', titulo = '') {
  const tituloNormalizado = limparTexto(titulo).toLowerCase();
  const paragrafos = [...corpoDaMateria(html).matchAll(/<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/gi)]
    .map((achado) => limparTexto(achado[1]))
    .filter(
      (texto) =>
        texto.length >= 40 &&
        !ehEntulho(texto) &&
        !NAO_E_TEXTO.test(texto) &&
        texto.toLowerCase() !== tituloNormalizado,
    );

  if (!paragrafos.length) return null;

  // Junta parágrafos até dar corpo ao resumo, sem passar do teto.
  let texto = '';
  for (const paragrafo of paragrafos) {
    texto = texto ? `${texto} ${paragrafo}` : paragrafo;
    if (texto.length >= MIN_RESUMO_MONTADO) break;
  }

  return texto.length >= MIN_CARACTERES ? { texto: aparar(texto), origem: 'texto da matéria' } : null;
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
  const tituloNormalizado = limparTexto(titulo).toLowerCase();

  const serve = (texto, minimo = MIN_CARACTERES) =>
    // Repetir a manchete não é resumo: não acrescenta nada a quem já a leu.
    texto && texto.length >= minimo && !ehEntulho(texto) && texto.toLowerCase() !== tituloNormalizado;

  const og = conteudoDaMeta(html, 'property', 'og:description');
  // A linha fina do veículo vem primeiro, desde que diga alguma coisa.
  if (serve(og, MIN_RESUMO_MONTADO)) return { texto: aparar(og), origem: 'og:description' };

  // Senão, monta-se o resumo com as primeiras frases da própria matéria.
  const doCorpo = resumoDoCorpo(html, titulo);
  if (doCorpo) return doCorpo;

  for (const [origem, texto] of [
    ['og:description', og],
    ['twitter:description', conteudoDaMeta(html, 'name', 'twitter:description')],
    ['meta description', conteudoDaMeta(html, 'name', 'description')],
    ['primeiro parágrafo', primeiroParagrafo(html)],
  ]) {
    if (serve(texto)) return { texto: aparar(texto), origem };
  }

  return null;
}

/**
 * A URL da matéria costuma vir embutida, em base64, no próprio identificador
 * do link do Google Notícias. Tentar decodificar sai de graça e evita uma
 * requisição; quando não dá certo, o coletor ainda tem o salto por HTTP.
 * @returns {string|null}
 */
export function urlEmbutidaDoGoogle(link = '') {
  try {
    const { hostname, pathname } = new URL(link);
    if (!/(^|\.)news\.google\.com$/i.test(hostname)) return null;

    const identificador = pathname.split('/').filter(Boolean).pop();
    if (!identificador || identificador.length < 16) return null;

    const base64 = identificador.replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Buffer.from(base64, 'base64').toString('latin1');
    const achado = bytes.match(/https?:\/\/[^\s\x00-\x1f"'<>\\]{12,}/);
    if (!achado) return null;

    const url = achado[0];
    return /(^|\.)google\.[a-z.]+$/i.test(new URL(url).hostname) ? null : url;
  } catch {
    return null;
  }
}

/**
 * O link do feed do Google Notícias aponta para a página de redirecionamento
 * dele. A matéria de verdade é o primeiro link externo dessa página — é dali
 * que o resumo do veículo pode ser lido.
 * @returns {string|null}
 */
export function linkDoVeiculo(html = '') {
  for (const achado of html.matchAll(/href=["'](https?:\/\/[^"']+)["']/gi)) {
    const url = achado[1];
    try {
      const { hostname } = new URL(url);
      if (/(^|\.)(google|gstatic|googleapis|youtube|blogger)\.[a-z.]+$/i.test(hostname)) continue;
      if (/(^|\.)policies\./i.test(hostname)) continue;
      return url;
    } catch {
      /* href malformado: segue procurando */
    }
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
