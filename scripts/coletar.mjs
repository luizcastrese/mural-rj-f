#!/usr/bin/env node
// Coleta as notícias, filtra o que interessa a quem atua com insolvência e
// grava dados/noticias.json — o único arquivo que a página lê.
//
//   node scripts/coletar.mjs                 coleta de verdade
//   node scripts/coletar.mjs --fixtures [dir]  lê XMLs de fixtures/ (offline)
//   node scripts/coletar.mjs --dias 45       janela de retenção
//   node scripts/coletar.mjs --saida /tmp/x.json  grava em outro arquivo
//   node scripts/coletar.mjs --reconstruir  descarta o acervo e recomeça
//   node scripts/coletar.mjs --sem-resumos  não abre as páginas das matérias

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { lerFeed } from './lib/rss.mjs';
import { classificar, normalizar, CATEGORIAS } from './lib/classificar.mjs';
import {
  extrairResumo,
  resumoDeFeedServe,
  linkDoVeiculo,
  urlEmbutidaDoGoogle,
  pareceMateria,
  textoDaMateria,
} from './lib/resumo.mjs';
import { resumirMateria, podeResumirComModelo, provedorDoResumo } from './lib/resumir.mjs';
import { agrupar } from './lib/agrupar.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Dimensionado sobre a coleta real: a primeira rodada trouxe 289 notícias,
// então o teto de 300 que eu havia estimado daria menos de dois dias de
// acervo. O JSON é servido comprimido, o que mantém o peso baixo no celular.
const LIMITE_ITENS = 900;
const TEMPO_LIMITE_MS = 20000;
// Busca do resumo na página da matéria: uma requisição por item novo.
const TEMPO_LIMITE_PAGINA_MS = 12000;
const RESUMOS_EM_PARALELO = 6;
const MAX_RESUMOS_POR_COLETA = 250;
// Quantos veículos do mesmo grupo tentar antes de desistir do resumo.
const TENTATIVAS_POR_GRUPO = 3;
// Versão da extração de resumo. Marcar a notícia como "já tentada" sem dizer
// com qual lógica congelava o acervo: itens tentados por uma versão quebrada
// nunca mais seriam reprocessados. Ao mudar a extração, incremente aqui.
const VERSAO_RESUMO = 3;

const args = process.argv.slice(2);
const usarFixtures = args.includes('--fixtures');
// --fixtures aceita um diretório próprio, o que deixa a coleta inteira
// testável contra um servidor local.
const dirFixtures = (() => {
  const seguinte = args[args.indexOf('--fixtures') + 1];
  return usarFixtures && seguinte && !seguinte.startsWith('--')
    ? path.resolve(seguinte)
    : null;
})();
const diasRetencao = Number(args[args.indexOf('--dias') + 1]) || 60;
const reconstruir = args.includes('--reconstruir');
const semResumos = args.includes('--sem-resumos');
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

async function baixar(url, tempoLimite = TEMPO_LIMITE_MS) {
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), tempoLimite);
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

// Como baixar(), mas informa a URL em que a resposta parou, para saber se o
// redirecionamento do Google já levou até o veículo.
async function baixarPagina(url) {
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), TEMPO_LIMITE_PAGINA_MS);
  try {
    const resposta = await fetch(url, {
      signal: controle.signal,
      redirect: 'follow',
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; MuralRJ/1.0; +https://github.com)',
        accept: 'text/html,application/xhtml+xml',
      },
    });
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
    return { html: await resposta.text(), urlFinal: resposta.url || url };
  } finally {
    clearTimeout(relogio);
  }
}

function ehGoogleNoticias(url) {
  try {
    return /(^|\.)news\.google\.com$/i.test(new URL(url).hostname);
  } catch {
    return false;
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
  const dir = dirFixtures || path.join(RAIZ, 'fixtures');
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
    if (!Array.isArray(conteudo.noticias)) return [];
    // Descarta o que ficou com link inservível; o feed traz a notícia de volta.
    return conteudo.noticias.filter((n) => pareceMateria(n.link));
  } catch {
    return [];
  }
}

// Abre a página da matéria e copia a linha fina publicada pelo veículo.
// Nada é redigido aqui: ou o texto é do veículo, ou o item fica sem resumo.
async function buscarResumoNaPagina(noticia) {
  try {
    // Primeira via: a URL da matéria costuma estar embutida no próprio link
    // do Google. Sai de graça e poupa uma ida à rede.
    const embutida = urlEmbutidaDoGoogle(noticia.link);
    let { html, urlFinal } = await baixarPagina(embutida || noticia.link);
    let link = noticia.link;

    // O link do feed do Google para na página de redirecionamento dele, cuja
    // descrição é institucional. Vale um segundo salto até o veículo — que de
    // quebra dá ao card um link direto para a matéria.
    if (ehGoogleNoticias(urlFinal)) {
      const doVeiculo = linkDoVeiculo(html);
      if (!doVeiculo) return { ...noticia, versaoResumo: VERSAO_RESUMO };
      const segunda = await baixarPagina(doVeiculo);
      html = segunda.html;
      // Só adota o novo endereço se ele levar a uma matéria.
      if (pareceMateria(segunda.urlFinal)) link = segunda.urlFinal;
    } else if (pareceMateria(urlFinal)) {
      link = urlFinal;
    }

    // Com o texto da matéria em mãos, o resumo é escrito a partir dele.
    // Sem chave da API, cai no recorte de frases da própria matéria.
    const achado =
      (await resumirMateria({ titulo: noticia.titulo, texto: textoDaMateria(html, noticia.titulo) }).catch(
        (erro) => {
          console.warn(`  ! resumo do modelo falhou: ${erro.message}`);
          return null;
        },
      )) || extrairResumo(html, noticia.titulo);

    if (!achado) return { ...noticia, link, versaoResumo: VERSAO_RESUMO };
    return {
      ...noticia,
      link,
      resumo: achado.texto,
      resumoFonte: achado.origem,
      versaoResumo: VERSAO_RESUMO,
    };
  } catch {
    // Paywall, timeout, 403: segue sem resumo, e não sem a notícia.
    return { ...noticia, versaoResumo: VERSAO_RESUMO };
  }
}

// Busca o resumo por grupo, não por item: uma notícia dada por dez veículos
// dá dez chances de encontrar quem publicou linha fina. Basta um acerto para
// o card ficar informativo, e o reagrupamento promove justamente esse veículo.
async function enriquecerResumos(noticias) {
  const grupos = new Map();
  for (const noticia of noticias) {
    if (!grupos.has(noticia.grupo)) grupos.set(noticia.grupo, []);
    grupos.get(noticia.grupo).push(noticia);
  }

  const filas = [];
  for (const itens of grupos.values()) {
    // Mesmo com resumo vindo do feed vale abrir a matéria: a description de
    // alguns portais começa com legenda de foto ("Reprodução/TV Globo") ou
    // com chamada de outra reportagem. A página traz o texto limpo, e o
    // resumo do feed fica como reserva se a busca não der em nada.
    // O representante primeiro; os outros veículos como reserva.
    const ordenados = [...itens].sort((a, b) => Number(b.principal) - Number(a.principal));
    const fila = ordenados
      .filter((n) => n.link && n.versaoResumo !== VERSAO_RESUMO)
      .slice(0, TENTATIVAS_POR_GRUPO);
    if (fila.length) filas.push(fila);
  }

  if (!filas.length) return { noticias, gruposTentados: 0, gruposComResumo: 0 };

  console.log(`\nBuscando resumo para ${filas.length} notícia(s) na fonte...`);
  const resolvidos = new Map();
  let requisicoes = 0;
  let gruposComResumo = 0;

  for (let i = 0; i < filas.length; i += RESUMOS_EM_PARALELO) {
    if (requisicoes >= MAX_RESUMOS_POR_COLETA) break;
    const lote = filas.slice(i, i + RESUMOS_EM_PARALELO);

    const prontos = await Promise.all(
      lote.map(async (fila) => {
        const tentados = [];
        for (const candidato of fila) {
          const item = await buscarResumoNaPagina(candidato);
          tentados.push(item);
          if (item.resumo) return { tentados, achou: true };
        }
        return { tentados, achou: false };
      }),
    );

    for (const { tentados, achou } of prontos) {
      requisicoes += tentados.length;
      if (achou) gruposComResumo += 1;
      for (const item of tentados) resolvidos.set(item.titulo, item);
    }
  }

  return {
    noticias: noticias.map((n) => resolvidos.get(n.titulo) || n),
    gruposTentados: filas.length,
    gruposComResumo,
  };
}

async function principal() {
  const config = JSON.parse(await readFile(path.join(RAIZ, 'fontes.json'), 'utf-8'));
  console.log(usarFixtures ? 'Lendo fixtures locais…' : 'Coletando feeds…');
  if (!semResumos) {
    console.log(
      podeResumirComModelo()
        ? `Resumos escritos via ${provedorDoResumo()}.`
        : 'Sem credencial de modelo: o resumo será recortado da matéria em vez de escrito.',
    );
  }

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
      // Só entra resumo que descreve a matéria; o resto é lixo de feed.
      resumo: resumoDeFeedServe(bruto.resumo, titulo) ? bruto.resumo : '',
      resumoFonte: resumoDeFeedServe(bruto.resumo, titulo) ? 'feed' : null,
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

  // Agrupa primeiro para saber quais notícias são a mesma; busca um resumo por
  // grupo; reagrupa, e aí o representante já é o veículo que tinha resumo.
  const preliminar = agrupar(noticias);
  const enriquecido = semResumos
    ? { noticias: preliminar, gruposTentados: 0, gruposComResumo: 0 }
    : await enriquecerResumos(preliminar);
  const publicadas = agrupar(enriquecido.noticias);
  // Só entra no mural a notícia que tem resumo: o propósito da página é
  // informar sem obrigar a abrir a matéria. As demais ficam no acervo e
  // voltam a ser tentadas na coleta seguinte.
  const cards = publicadas.filter((n) => n.principal && n.resumo);

  const porCategoria = Object.fromEntries(
    CATEGORIAS.map((c) => [c.id, cards.filter((n) => n.categoria === c.id).length]),
  );

  const saida = {
    atualizadoEm: new Date().toISOString(),
    total: cards.length,
    totalComRepetidas: publicadas.length,
    comResumo: cards.filter((n) => n.resumo).length,
    categorias: CATEGORIAS.map(({ id, nome, descricao }) => ({ id, nome, descricao })),
    porCategoria,
    fontes: status,
    noticias: publicadas,
  };

  await writeFile(SAIDA, `${JSON.stringify(saida, null, 2)}\n`, 'utf-8');

  console.log(
    `\n${brutos.length} itens brutos → ${novasEntradas} novas · ${acervo.length} no acervo → ${publicadas.length} publicadas`,
  );
  if (enriquecido.gruposTentados) {
    console.log(
      `resumo encontrado em ${enriquecido.gruposComResumo}/${enriquecido.gruposTentados} noticia(s)`,
    );
  }
  console.log(`com resumo: ${saida.comResumo}/${cards.length}`);
  const semResumoAinda = publicadas.filter((n) => n.principal && !n.resumo).length;
  console.log(`agrupamento: ${publicadas.length} notícias → ${cards.length} cards`);
  console.log(`retidas por falta de resumo: ${semResumoAinda}`);
  for (const [id, qtd] of Object.entries(porCategoria)) console.log(`  ${id.padEnd(15)} ${qtd}`);
  const falhas = status.filter((s) => !s.ok);
  if (falhas.length) console.log(`\n${falhas.length} fonte(s) indisponível(is): ${falhas.map((f) => f.nome).join(', ')}`);
  console.log(`\nGravado em ${path.relative(RAIZ, SAIDA)}`);
}

principal().catch((erro) => {
  console.error('Falha na coleta:', erro);
  process.exit(1);
});
