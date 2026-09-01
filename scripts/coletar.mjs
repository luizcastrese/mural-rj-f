#!/usr/bin/env node
// Coleta as notícias, filtra o que interessa a quem atua com insolvência e
// grava dados/noticias.json — o único arquivo que a página lê.
//
//   node scripts/coletar.mjs                 coleta de verdade
//   node scripts/coletar.mjs --fixtures      lê os XMLs de fixtures/ (offline)
//   node scripts/coletar.mjs --dias 45       janela de retenção
//   node scripts/coletar.mjs --saida /tmp/x.json  grava em outro arquivo
//   node scripts/coletar.mjs --reconstruir  descarta o acervo e recomeça

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { lerFeed } from './lib/rss.mjs';
import { classificar, normalizar, CATEGORIAS } from './lib/classificar.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIMITE_ITENS = 300;
const TEMPO_LIMITE_MS = 20000;

const args = process.argv.slice(2);
const usarFixtures = args.includes('--fixtures');
const diasRetencao = Number(args[args.indexOf('--dias') + 1]) || 60;
const reconstruir = args.includes('--reconstruir');
const SAIDA = args.includes('--saida')
  ? path.resolve(args[args.indexOf('--saida') + 1])
  : path.join(RAIZ, 'dados', 'noticias.json');

function urlGoogleNews(consulta) {
  const params = new URLSearchParams({
    q: consulta,
    hl: 'pt-BR',
    gl: 'BR',
    ceid: 'BR:pt-419',
  });
  return `https://news.google.com/rss/search?${params}`;
}

async function baixar(url) {
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), TEMPO_LIMITE_MS);
  try {
    const resposta = await fetch(url, {
      signal: controle.signal,
      headers: {
        // Alguns portais rejeitam requisições sem User-Agent de navegador.
        'user-agent': 'Mozilla/5.0 (compatible; MuralRJ/1.0; +https://github.com)',
        accept: 'application/rss+xml, application/xml, text/xml, */*',
      },
    });
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
    return await resposta.text();
  } finally {
    clearTimeout(relogio);
  }
}

// O Google News assina o veículo no fim do título: "Manchete - Veículo".
function separarVeiculo(titulo, fonteItem) {
  if (fonteItem) {
    const sufixo = new RegExp(`\\s+[-–—]\\s+${fonteItem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    return { titulo: titulo.replace(sufixo, '').trim(), veiculo: fonteItem };
  }
  const partes = titulo.split(/\s+[-–—]\s+/);
  if (partes.length > 1) {
    const ultima = partes[partes.length - 1];
    if (ultima.length <= 40) {
      return { titulo: partes.slice(0, -1).join(' - ').trim(), veiculo: ultima.trim() };
    }
  }
  return { titulo, veiculo: '' };
}

function chaveDedupe(titulo) {
  return normalizar(titulo).replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

async function coletarFonte({ nome, url }) {
  const xml = await baixar(url);
  return lerFeed(xml).map((item) => ({ ...item, origem: nome }));
}

async function coletarFixtures() {
  const dir = path.join(RAIZ, 'fixtures');
  const arquivos = (await readdir(dir)).filter((f) => f.endsWith('.xml'));
  const lotes = await Promise.all(
    arquivos.map(async (arquivo) => {
      const xml = await readFile(path.join(dir, arquivo), 'utf-8');
      return lerFeed(xml).map((item) => ({ ...item, origem: path.basename(arquivo, '.xml') }));
    }),
  );
  return {
    itens: lotes.flat(),
    status: arquivos.map((a) => ({ nome: path.basename(a, '.xml'), ok: true, itens: 0 })),
  };
}

async function coletarRede(config) {
  const fontes = [
    ...config.buscasGoogleNews.map((b) => ({ nome: b.nome, url: urlGoogleNews(b.consulta) })),
    ...config.feedsDiretos,
  ];

  const resultados = await Promise.all(
    fontes.map(async (fonte) => {
      try {
        const itens = await coletarFonte(fonte);
        return { fonte, itens, erro: null };
      } catch (erro) {
        // Uma fonte fora do ar não pode derrubar a atualização inteira.
        console.warn(`  ! ${fonte.nome}: ${erro.message}`);
        return { fonte, itens: [], erro: erro.message };
      }
    }),
  );

  return {
    itens: resultados.flatMap((r) => r.itens),
    status: resultados.map((r) => ({
      nome: r.fonte.nome,
      ok: !r.erro,
      itens: r.itens.length,
      ...(r.erro ? { erro: r.erro } : {}),
    })),
  };
}

// Reaproveita o que já foi publicado, ignorando um arquivo ausente ou inválido.
async function lerAcervo() {
  try {
    const conteudo = JSON.parse(await readFile(SAIDA, 'utf-8'));
    return Array.isArray(conteudo.noticias) ? conteudo.noticias : [];
  } catch {
    return [];
  }
}

async function principal() {
  const config = JSON.parse(await readFile(path.join(RAIZ, 'fontes.json'), 'utf-8'));
  console.log(usarFixtures ? 'Lendo fixtures locais…' : 'Coletando feeds…');

  const { itens: brutos, status } = usarFixtures
    ? await coletarFixtures()
    : await coletarRede(config);

  const corte = Date.now() - diasRetencao * 24 * 60 * 60 * 1000;
  const agora = new Date().toISOString();
  const vistos = new Map();

  // O acervo já publicado entra primeiro: os feeds só mostram os últimos
  // itens, então sem isso a notícia de anteontem sumiria do mural — e uma
  // coleta que falhasse em todas as fontes zeraria a página.
  const acervo = reconstruir ? [] : await lerAcervo();
  for (const antiga of acervo) {
    vistos.set(chaveDedupe(antiga.titulo), antiga);
  }

  let novasEntradas = 0;
  for (const bruto of brutos) {
    const { titulo, veiculo } = separarVeiculo(bruto.titulo, bruto.fonteItem);
    const analise = classificar({ titulo, resumo: bruto.resumo });
    if (!analise.relevante) continue;

    const chave = chaveDedupe(titulo);
    const anterior = vistos.get(chave);
    // A mesma manchete chega por várias buscas; fica a de maior pontuação.
    if (anterior && anterior.pontuacao >= analise.pontuacao) continue;
    if (!anterior) novasEntradas += 1;

    vistos.set(chave, {
      titulo,
      link: bruto.link,
      resumo: bruto.resumo === titulo ? '' : bruto.resumo,
      veiculo: veiculo || bruto.origem,
      data: bruto.data,
      categoria: analise.categoria,
      etiquetas: analise.etiquetas,
      pontuacao: analise.pontuacao,
      // Serve de referência de idade para o item que vem sem data.
      coletadoEm: anterior?.coletadoEm || agora,
    });
  }

  const noticias = [...vistos.values()]
    .filter((n) => new Date(n.data || n.coletadoEm || 0).getTime() >= corte)
    .sort((a, b) => new Date(b.data || b.coletadoEm || 0) - new Date(a.data || a.coletadoEm || 0))
    .slice(0, LIMITE_ITENS);

  const porCategoria = Object.fromEntries(
    CATEGORIAS.map((c) => [c.id, noticias.filter((n) => n.categoria === c.id).length]),
  );

  const saida = {
    atualizadoEm: new Date().toISOString(),
    total: noticias.length,
    categorias: CATEGORIAS.map(({ id, nome, descricao }) => ({ id, nome, descricao })),
    porCategoria,
    fontes: status,
    noticias,
  };

  await writeFile(SAIDA, `${JSON.stringify(saida, null, 2)}\n`, 'utf-8');

  console.log(
    `\n${brutos.length} itens brutos → ${novasEntradas} novas · ${acervo.length} no acervo → ${noticias.length} publicadas`,
  );
  for (const [id, qtd] of Object.entries(porCategoria)) console.log(`  ${id.padEnd(15)} ${qtd}`);
  const falhas = status.filter((s) => !s.ok);
  if (falhas.length) console.log(`\n${falhas.length} fonte(s) indisponível(is): ${falhas.map((f) => f.nome).join(', ')}`);
  console.log(`\nGravado em ${path.relative(RAIZ, SAIDA)}`);
}

principal().catch((erro) => {
  console.error('Falha na coleta:', erro);
  process.exit(1);
});
