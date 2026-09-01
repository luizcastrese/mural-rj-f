// Testes da coleta: node --test scripts/testar.mjs
// Cobrem o parser de feed, o classificador e a mesclagem com o acervo.

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { lerFeed, limparTexto } from './lib/rss.mjs';
import { classificar } from './lib/classificar.mjs';
import { extrairResumo, resumoDeFeedServe } from './lib/resumo.mjs';

const executar = promisify(execFile);
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COLETOR = path.join(RAIZ, 'scripts', 'coletar.mjs');

test('limparTexto resolve HTML escapado, CDATA e entidades', () => {
  assert.equal(limparTexto('<p>Credores &amp; o AJ</p>'), 'Credores & o AJ');
  assert.equal(limparTexto('&lt;p&gt;A 2&ordf; Vara deferiu.&lt;/p&gt;'), 'A 2ª Vara deferiu.');
  assert.equal(limparTexto('<![CDATA[Falência da Ac&ccedil;o]]>'), 'Falência da Acço');
  assert.equal(limparTexto('&#233;poca &#x41;'), 'época A');
});

test('lerFeed entende RSS 2.0', () => {
  const [item] = lerFeed(`<rss><channel><item>
    <title>Recuperação judicial deferida</title>
    <link>https://exemplo.test/a</link>
    <description>Resumo</description>
    <pubDate>Mon, 24 Aug 2026 12:00:00 GMT</pubDate>
    <source url="x">Valor</source>
  </item></channel></rss>`);

  assert.equal(item.titulo, 'Recuperação judicial deferida');
  assert.equal(item.link, 'https://exemplo.test/a');
  assert.equal(item.fonteItem, 'Valor');
  assert.equal(item.data, '2026-08-24T12:00:00.000Z');
});

test('lerFeed entende Atom, inclusive o link no atributo href', () => {
  const [item] = lerFeed(`<feed><entry>
    <title>Falência decretada</title>
    <link rel="edit" href="https://exemplo.test/editar"/>
    <link rel="alternate" href="https://exemplo.test/materia"/>
    <summary>Resumo</summary>
    <published>2026-08-30T10:00:00Z</published>
  </entry></feed>`);

  assert.equal(item.link, 'https://exemplo.test/materia');
  assert.equal(item.data, '2026-08-30T10:00:00.000Z');
});

test('lerFeed descarta item sem título ou sem link', () => {
  const itens = lerFeed(`<rss><channel>
    <item><title>Sem link</title></item>
    <item><link>https://exemplo.test/sem-titulo</link></item>
  </channel></rss>`);
  assert.equal(itens.length, 0);
});

test('classificar separa cada eixo do mural', () => {
  const casos = [
    ['Justiça defere o processamento da recuperação judicial da Alfa', 'novas-rjs'],
    ['Empresa pede recuperação judicial com dívida de R$ 1,2 bilhão', 'novas-rjs'],
    ['Juiz decreta a falência da Beta após convolação', 'falencias'],
    ['STJ fixa em recurso repetitivo o alcance do stay period', 'jurisprudencia'],
    ['Câmara aprova projeto de lei que altera a Lei 11.101', 'legislacao'],
    ['Credores aprovam plano de recuperação judicial com venda de UPI', 'mercado'],
  ];
  for (const [titulo, esperada] of casos) {
    const r = classificar({ titulo, resumo: '' });
    assert.equal(r.relevante, true, `deveria ser relevante: ${titulo}`);
    assert.equal(r.categoria, esperada, `categoria errada em: ${titulo}`);
  }
});

test('classificar rejeita "falência" fora do sentido empresarial', () => {
  const ruidos = [
    'Paciente morre de falência múltipla de órgãos',
    'Técnico lamenta a falência moral do futebol brasileiro',
    'Especialistas apontam falência da segurança pública no estado',
    'Bolsa fecha em alta com exportações de soja',
  ];
  for (const titulo of ruidos) {
    assert.equal(classificar({ titulo, resumo: '' }).relevante, false, `deveria ser descartado: ${titulo}`);
  }
});

test('classificar mantém falência empresarial mesmo perto de termo ambíguo', () => {
  const r = classificar({
    titulo: 'Massa falida discute falência do estado de conservação dos ativos',
    resumo: '',
  });
  assert.equal(r.relevante, true);
});

test('classificar extrai etiquetas temáticas', () => {
  const r = classificar({
    titulo: 'STJ decide sobre crédito trabalhista e consolidação substancial na recuperação judicial',
    resumo: '',
  });
  assert.ok(r.etiquetas.includes('STJ'));
  assert.ok(r.etiquetas.includes('Crédito trabalhista'));
});

test('coleta deduplica, mescla com o acervo e sobrevive a fonte fora do ar', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'mural-'));
  const saida = path.join(dir, 'noticias.json');
  t.after(() => rm(dir, { recursive: true, force: true }));

  const rodar = (extra = []) =>
    executar('node', [COLETOR, '--fixtures', '--dias', '999999', '--saida', saida, ...extra]);

  await rodar();
  const primeira = JSON.parse(await readFile(saida, 'utf-8'));

  // As fixtures trazem 11 itens: 3 são ruído e 1 é manchete repetida.
  assert.equal(primeira.total, 7);
  assert.equal(new Set(primeira.noticias.map((n) => n.titulo)).size, 7);

  // Na duplicata, vence a versão de maior pontuação (a do Valor).
  const alfa = primeira.noticias.find((n) => n.titulo.includes('Alfa Alimentos'));
  assert.equal(alfa.veiculo, 'Valor Econômico');

  // Rodar de novo não pode duplicar nada.
  await rodar();
  const segunda = JSON.parse(await readFile(saida, 'utf-8'));
  assert.equal(segunda.total, 7);

  // Ordenação: mais recente primeiro.
  const datas = segunda.noticias.map((n) => new Date(n.data).getTime());
  assert.deepEqual(datas, [...datas].sort((a, b) => b - a));

  // --reconstruir descarta o acervo e recomeça do zero.
  const limpo = path.join(dir, 'limpo.json');
  await executar('node', [COLETOR, '--fixtures', '--dias', '999999', '--saida', limpo, '--reconstruir']);
  assert.equal(JSON.parse(await readFile(limpo, 'utf-8')).total, 7);
});

test('a janela de retenção descarta o que envelheceu', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'mural-'));
  const saida = path.join(dir, 'noticias.json');
  t.after(() => rm(dir, { recursive: true, force: true }));

  // As fixtures são de agosto de 2026; com 1 dia de janela nada sobrevive.
  await executar('node', [COLETOR, '--fixtures', '--dias', '1', '--saida', saida]);
  const dados = JSON.parse(await readFile(saida, 'utf-8'));
  assert.equal(dados.total, 0);
  assert.ok(Array.isArray(dados.categorias) && dados.categorias.length > 0);
});

// ---------- resumo: só texto literal da fonte ----------

test('extrairResumo prefere a linha fina que o veículo publica', () => {
  const html = `<html><head>
    <meta property="og:description" content="A 2ª Vara Empresarial deferiu o processamento e nomeou administrador judicial para o grupo, que declarou dívida de R$ 430 milhões.">
    <meta name="description" content="Outra coisa qualquer que não deveria ser escolhida primeiro.">
  </head><body><p>Corpo da matéria.</p></body></html>`;

  const r = extrairResumo(html, 'Justiça defere RJ do Grupo Alfa');
  assert.equal(r.origem, 'og:description');
  assert.ok(r.texto.startsWith('A 2ª Vara Empresarial deferiu'));
  assert.ok(r.texto.includes('R$ 430 milhões'));
});

test('extrairResumo cai para a meta description quando não há og', () => {
  const html = `<html><head>
    <meta name="description" content="O Superior Tribunal de Justiça fixou tese sobre o alcance do stay period nas execuções fiscais movidas contra empresas em recuperação.">
  </head><body></body></html>`;
  const r = extrairResumo(html, 'STJ fixa tese');
  assert.equal(r.origem, 'meta description');
});

test('extrairResumo descarta entulho de paywall e usa o parágrafo real', () => {
  const html = `<html><head>
    <meta property="og:description" content="Assine o jornal para ler esta e outras reportagens exclusivas do nosso time.">
  </head><body>
    <p>Curto.</p>
    <p>O juízo da 1ª Vara de Falências decretou a quebra da companhia após a rejeição do plano pelos credores em assembleia realizada na terça-feira.</p>
  </body></html>`;
  const r = extrairResumo(html, 'Empresa tem falência decretada');
  assert.equal(r.origem, 'primeiro parágrafo');
  assert.ok(r.texto.includes('1ª Vara de Falências'));
});

test('extrairResumo devolve null quando a fonte não publicou resumo', () => {
  const html = '<html><head><title>Notícia</title></head><body><p>Leia mais.</p></body></html>';
  assert.equal(extrairResumo(html, 'Alguma manchete'), null);
});

test('extrairResumo não aceita a própria manchete como resumo', () => {
  const titulo = 'Justiça defere o processamento da recuperação judicial do Grupo Alfa Alimentos';
  const html = `<html><head><meta property="og:description" content="${titulo}"></head></html>`;
  assert.equal(extrairResumo(html, titulo), null);
});

test('resumoDeFeedServe rejeita a lista de links do Google Notícias', () => {
  const lixo = 'Justiça defere RJ do Grupo Alfa Valor Econômico Empresa entra em recuperação InfoMoney View Full Coverage on Google News';
  assert.equal(resumoDeFeedServe(lixo, 'Justiça defere RJ do Grupo Alfa'), false);
  assert.equal(resumoDeFeedServe('Alfa Alimentos', 'Alfa Alimentos'), false);
  assert.equal(
    resumoDeFeedServe(
      'A 2ª Vara Empresarial deferiu o processamento e nomeou o administrador judicial da companhia nesta segunda-feira.',
      'Justiça defere RJ do Grupo Alfa',
    ),
    true,
  );
});

test('a coleta busca o resumo na página da matéria, literalmente', async (t) => {
  const LINHA_FINA =
    'A 2ª Vara Empresarial de São Paulo deferiu o processamento e nomeou administrador judicial; a companhia declarou dívida de R$ 430 milhões.';

  const paginas = {
    '/com-og': `<html><head><meta property="og:description" content="${LINHA_FINA}"></head><body></body></html>`,
    '/sem-resumo': '<html><head><title>Nada aqui</title></head><body><p>Leia mais.</p></body></html>',
  };

  const servidor = createServer((req, res) => {
    const corpo = paginas[req.url];
    if (!corpo) {
      res.writeHead(404).end('nao encontrado');
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(corpo);
  });
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
  const porta = servidor.address().port;

  const dir = await mkdtemp(path.join(tmpdir(), 'mural-resumo-'));
  t.after(async () => {
    servidor.close();
    await rm(dir, { recursive: true, force: true });
  });

  // Feed no formato do Google Notícias: description é lista de links, não resumo.
  await writeFile(
    path.join(dir, 'busca.xml'),
    `<rss><channel>
      <item>
        <title>Justiça defere o processamento da recuperação judicial do Grupo Alfa - Valor</title>
        <link>http://127.0.0.1:${porta}/com-og</link>
        <description>&lt;ol&gt;&lt;li&gt;&lt;a href="http://x"&gt;Justiça defere RJ&lt;/a&gt;&lt;font&gt;Valor&lt;/font&gt;&lt;/li&gt;&lt;/ol&gt;</description>
        <pubDate>${new Date().toUTCString()}</pubDate>
      </item>
      <item>
        <title>Beta Varejo tem falência decretada após convolação - Folha</title>
        <link>http://127.0.0.1:${porta}/sem-resumo</link>
        <description>&lt;ol&gt;&lt;li&gt;&lt;a href="http://y"&gt;Falência decretada&lt;/a&gt;&lt;/li&gt;&lt;/ol&gt;</description>
        <pubDate>${new Date().toUTCString()}</pubDate>
      </item>
    </channel></rss>`,
    'utf-8',
  );

  const saida = path.join(dir, 'noticias.json');
  await executar('node', [COLETOR, '--fixtures', dir, '--dias', '999999', '--saida', saida]);
  const dados = JSON.parse(await readFile(saida, 'utf-8'));

  const alfa = dados.noticias.find((n) => n.titulo.includes('Alfa'));
  const beta = dados.noticias.find((n) => n.titulo.includes('Beta'));

  // O resumo é o texto do veículo, caractere por caractere.
  assert.equal(alfa.resumo, LINHA_FINA);
  assert.equal(alfa.resumoFonte, 'og:description');

  // Sem resumo publicado, o item fica sem resumo — nada é inventado.
  assert.equal(beta.resumo, '');
  assert.equal(beta.resumoTentado, true);
  assert.equal(dados.comResumo, 1);
});
