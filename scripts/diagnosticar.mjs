#!/usr/bin/env node
// Diagnóstico de fontes. Roda no GitHub Actions, onde há rede, e mede o que
// interessa em cada candidata: ela responde? os links vão direto ao veículo
// (e não a um redirecionador)? a description já traz resumo de verdade?

import { lerFeed } from './lib/rss.mjs';
import { resumoDeFeedServe, extrairResumo } from './lib/resumo.mjs';

const UA = 'Mozilla/5.0 (compatible; MuralRJ/1.0; +https://github.com)';
const CONSULTA = '"recuperação judicial"';

const CANDIDATAS = [
  ['Valor', 'https://pox.globo.com/rss/valor'],
  ['InfoMoney', 'https://www.infomoney.com.br/feed/'],
  ['Poder360', 'https://www.poder360.com.br/feed/'],
  ['Conjur', 'https://www.conjur.com.br/rss.xml'],
  ['JOTA', 'https://www.jota.info/feed'],
  ['Migalhas c', 'https://www.migalhas.com.br/RSS/MigalhasQuentes'],
  ['Migalhas d', 'https://www.migalhas.com.br/coluna/rss'],
  ['STJ c', 'https://www.stj.jus.br/sites/portalp/Feed'],
  ['G1 Economia', 'https://g1.globo.com/rss/g1/economia/'],
  ['Folha Mercado', 'https://feeds.folha.uol.com.br/mercado/rss091.xml'],
  ['UOL Economia', 'https://rss.uol.com.br/feed/economia.xml'],
  ['Agência Brasil', 'https://agenciabrasil.ebc.com.br/rss/economia/feed.xml'],
  ['CNN Economia', 'https://www.cnnbrasil.com.br/economia/feed/'],
  ['Brazil Journal', 'https://braziljournal.com/feed/'],
  ['NeoFeed', 'https://neofeed.com.br/feed/'],
  ['Money Times', 'https://www.moneytimes.com.br/feed/'],
  ['Exame', 'https://exame.com/feed/'],
  ['Estadão Econ', 'https://www.estadao.com.br/rss/economia.xml'],
];


async function pegar(url) {
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), 15000);
  try {
    const r = await fetch(url, { signal: controle.signal, headers: { 'user-agent': UA } });
    return { status: r.status, texto: await r.text() };
  } finally {
    clearTimeout(relogio);
  }
}

for (const [nome, url] of CANDIDATAS) {
  try {
    const { status, texto } = await pegar(url);
    const itens = lerFeed(texto);
    if (!itens.length) {
      console.log(`${nome.padEnd(20)} HTTP ${status}  0 itens`);
      continue;
    }
    const amostra = itens[0];
    const host = (() => {
      try {
        return new URL(amostra.link).hostname;
      } catch {
        return '?';
      }
    })();
    const comResumo = itens.filter((i) => resumoDeFeedServe(i.resumo, i.titulo)).length;
    console.log(
      `${nome.padEnd(20)} HTTP ${status}  ${String(itens.length).padStart(3)} itens  ` +
        `link->${host.padEnd(26)} description util: ${comResumo}/${itens.length}`,
    );
    console.log(`  titulo: ${amostra.titulo.slice(0, 70)}`);
    console.log(`  descr : ${(amostra.resumo || '(vazia)').slice(0, 110)}`);

    // A matéria é alcançável? Dá para montar resumo com o texto dela?
    if (host && host !== '?' && !/news\.google|bing\.com/.test(host)) {
      try {
        const pagina = await pegar(amostra.link);
        const r = extrairResumo(pagina.texto, amostra.titulo);
        console.log(`  materia: HTTP ${pagina.status}, resumo -> ${r ? `[${r.origem}] ${r.texto.slice(0, 80)}` : '(nenhum)'}`);
      } catch (e) {
        console.log(`  materia: ERRO ${e.message}`);
      }
    }
  } catch (erro) {
    console.log(`${nome.padEnd(20)} ERRO  ${erro.message}`);
  }
  console.log();
}
