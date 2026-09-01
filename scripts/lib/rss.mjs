// Parser mínimo de RSS 2.0 e Atom. Sem dependências: os feeds de notícia
// usados aqui são simples e previsíveis, e evitar node_modules mantém o
// workflow do GitHub Actions rápido e sem lockfile para manter.

const ENTIDADES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  aacute: 'á', agrave: 'à', atilde: 'ã', acirc: 'â',
  eacute: 'é', ecirc: 'ê', iacute: 'í',
  oacute: 'ó', otilde: 'õ', ocirc: 'ô',
  uacute: 'ú', ccedil: 'ç',
  Aacute: 'Á', Atilde: 'Ã', Acirc: 'Â',
  Eacute: 'É', Ecirc: 'Ê', Iacute: 'Í',
  Oacute: 'Ó', Otilde: 'Õ', Ocirc: 'Ô',
  Uacute: 'Ú', Ccedil: 'Ç',
  hellip: '…', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘',
  ldquo: '“', rdquo: '”', laquo: '«', raquo: '»', deg: '°',
  ordf: 'ª', ordm: 'º', sup2: '²', sup3: '³', middot: '·', bull: '•',
};

export function decodificar(texto = '') {
  return texto
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (todo, nome) => (nome in ENTIDADES ? ENTIDADES[nome] : todo));
}

// Feeds costumam trazer HTML na descrição; a página exibe texto puro.
// Boa parte deles entrega o HTML escapado (&lt;p&gt;), então é preciso
// decodificar antes de remover tags — duas passadas cobrem os dois níveis.
export function limparTexto(bruto = '') {
  let texto = bruto.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  for (let passada = 0; passada < 2; passada += 1) {
    texto = decodificar(texto).replace(/<[^>]*>/g, ' ');
  }
  return texto.replace(/\s+/g, ' ').trim();
}

function conteudoDaTag(bloco, tag) {
  // [^>]* cobre atributos (ex.: <content:encoded type="html">).
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const achado = bloco.match(re);
  return achado ? achado[1] : '';
}

function linkDoBloco(bloco) {
  const direto = limparTexto(conteudoDaTag(bloco, 'link'));
  if (direto.startsWith('http')) return direto;
  // Atom guarda a URL no atributo href, preferindo rel="alternate".
  const hrefs = [...bloco.matchAll(/<link\b([^>]*)>/gi)].map((m) => m[1]);
  const alternate = hrefs.find((attrs) => /rel=["']?alternate/i.test(attrs)) || hrefs[0];
  if (alternate) {
    const href = alternate.match(/href=["']([^"']+)["']/i);
    if (href) return decodificar(href[1]);
  }
  const guid = limparTexto(conteudoDaTag(bloco, 'guid'));
  return guid.startsWith('http') ? guid : '';
}

function dataDoBloco(bloco) {
  for (const tag of ['pubDate', 'published', 'updated', 'dc:date', 'date']) {
    const bruto = limparTexto(conteudoDaTag(bloco, tag));
    if (!bruto) continue;
    const data = new Date(bruto);
    if (!Number.isNaN(data.getTime())) return data.toISOString();
  }
  return null;
}

/**
 * Converte o XML de um feed em itens normalizados.
 * @returns {{titulo:string,link:string,resumo:string,data:string|null,fonteItem:string}[]}
 */
export function lerFeed(xml = '') {
  const blocos = [
    ...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi),
    ...xml.matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/gi),
  ].map((m) => m[1]);

  return blocos
    .map((bloco) => {
      const resumoBruto =
        conteudoDaTag(bloco, 'description') ||
        conteudoDaTag(bloco, 'summary') ||
        conteudoDaTag(bloco, 'content:encoded') ||
        conteudoDaTag(bloco, 'content');
      return {
        titulo: limparTexto(conteudoDaTag(bloco, 'title')),
        link: linkDoBloco(bloco),
        resumo: limparTexto(resumoBruto).slice(0, 400),
        data: dataDoBloco(bloco),
        // O Google News assina a origem real da matéria nesta tag.
        fonteItem: limparTexto(conteudoDaTag(bloco, 'source')),
      };
    })
    .filter((item) => item.titulo && item.link);
}
