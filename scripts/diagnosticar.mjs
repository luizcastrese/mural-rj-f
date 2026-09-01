#!/usr/bin/env node
// Diagnóstico da busca de resumo. Roda no GitHub Actions, onde há rede, e
// mostra o que cada etapa devolve para um punhado de matérias reais.
//   node scripts/diagnosticar.mjs

import { lerFeed } from './lib/rss.mjs';
import { extrairResumo, linkDoVeiculo, urlEmbutidaDoGoogle } from './lib/resumo.mjs';

const BUSCA =
  'https://news.google.com/rss/search?q=%22recupera%C3%A7%C3%A3o+judicial%22&hl=pt-BR&gl=BR&ceid=BR:pt-419';
const UA = 'Mozilla/5.0 (compatible; MuralRJ/1.0; +https://github.com)';

async function pegar(url, extra = {}) {
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), 15000);
  try {
    const r = await fetch(url, { signal: controle.signal, headers: { 'user-agent': UA }, ...extra });
    return { ok: r.ok, status: r.status, url: r.url, html: await r.text() };
  } finally {
    clearTimeout(relogio);
  }
}

const feed = await pegar(BUSCA);
const itens = lerFeed(feed.html).slice(0, 3);
console.log(`feed: HTTP ${feed.status}, ${lerFeed(feed.html).length} itens\n`);

for (const item of itens) {
  console.log('='.repeat(70));
  console.log('TÍTULO :', item.titulo.slice(0, 80));
  console.log('LINK   :', item.link.slice(0, 110));

  const embutida = urlEmbutidaDoGoogle(item.link);
  console.log('DECODIF:', embutida || '(nada)');

  if (embutida) {
    try {
      const p = await pegar(embutida);
      console.log('  -> HTTP', p.status, '| url final:', p.url.slice(0, 90));
      const r = extrairResumo(p.html, item.titulo);
      console.log('  -> resumo:', r ? `[${r.origem}] ${r.texto.slice(0, 90)}` : '(nenhum)');
    } catch (e) {
      console.log('  -> ERRO:', e.message);
    }
  }

  try {
    const g = await pegar(item.link);
    console.log('GOOGLE : HTTP', g.status, '| url final:', g.url.slice(0, 90));
    console.log('  html :', g.html.length, 'bytes');
    console.log('  trecho:', g.html.replace(/\s+/g, ' ').slice(0, 260));
    const doVeiculo = linkDoVeiculo(g.html);
    console.log('  linkDoVeiculo:', doVeiculo || '(nada)');
    console.log('  hrefs (5):', [...g.html.matchAll(/href=["']([^"']+)["']/gi)].slice(0, 5).map((m) => m[1].slice(0, 70)));
    const r = extrairResumo(g.html, item.titulo);
    console.log('  resumo da página do Google:', r ? `[${r.origem}] ${r.texto.slice(0, 70)}` : '(nenhum)');
  } catch (e) {
    console.log('GOOGLE : ERRO', e.message);
  }
  console.log();
}
