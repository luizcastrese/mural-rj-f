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
import {
  extrairResumo,
  resumoDeFeedServe,
  linkDoVeiculo,
  urlEmbutidaDoGoogle,
  resumoDoCorpo,
} from './lib/resumo.mjs';
import { agrupar, empresas } from './lib/agrupar.mjs';

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
  // "falência do estado" está na lista de falsos positivos, mas aqui a
  // manchete noticia uma quebra de verdade e precisa passar.
  const r = classificar({
    titulo: 'Justiça decreta falência da Alfa; defesa alegava falência do estado de conservação dos ativos',
    resumo: '',
  });
  assert.equal(r.relevante, true);
  assert.equal(r.categoria, 'falencias');
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

test('extrairResumo descarta entulho de paywall e monta com o texto da matéria', () => {
  const html = `<html><head>
    <meta property="og:description" content="Assine o jornal para ler esta e outras reportagens exclusivas do nosso time.">
  </head><body>
    <p>Curto.</p>
    <p>O juízo da 1ª Vara de Falências decretou a quebra da companhia após a rejeição do plano pelos credores em assembleia realizada na terça-feira.</p>
  </body></html>`;
  const r = extrairResumo(html, 'Empresa tem falência decretada');
  assert.equal(r.origem, 'texto da matéria');
  assert.ok(r.texto.includes('1ª Vara de Falências'));
});

test('resumoDoCorpo monta com as frases da matéria e ignora o que não é texto', () => {
  const html = `<html><body><article>
    <figcaption>Foto: divulgação</figcaption>
    <p>Leia também: outra reportagem sobre o mesmo assunto do nosso arquivo</p>
    <p>A 2ª Vara Empresarial deferiu o processamento da recuperação judicial do Grupo Alfa nesta segunda-feira.</p>
    <p>A companhia declarou dívida de R$ 430 milhões e obteve a suspensão das execuções por 180 dias.</p>
    <p>O administrador judicial terá 15 dias para o primeiro relatório.</p>
  </article></body></html>`;

  const r = resumoDoCorpo(html, 'Justiça defere RJ do Grupo Alfa');
  assert.equal(r.origem, 'texto da matéria');
  // Começa pela primeira frase da notícia, não pela legenda nem pela chamada.
  assert.ok(r.texto.startsWith('A 2ª Vara Empresarial deferiu'));
  assert.ok(r.texto.includes('R$ 430 milhões'));
  assert.ok(!r.texto.includes('Leia também'));
  assert.ok(!r.texto.includes('Foto:'));
});

test('resumoDoCorpo devolve null quando não há texto de matéria', () => {
  assert.equal(resumoDoCorpo('<html><body><p>Curto.</p></body></html>', 'Manchete'), null);
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

// ---------- agrupamento de uma notícia dada por vários veículos ----------

test('agrupar junta a mesma notícia com manchetes diferentes', () => {
  const agora = new Date().toISOString();
  const entrada = [
    { titulo: 'Refit tem a falência decretada', veiculo: 'Valor', data: agora, pontuacao: 20, resumo: 'Linha fina do Valor.' },
    { titulo: 'Grupo Refit tem falência decretada pela Justiça do Rio', veiculo: 'Poder360', data: agora, pontuacao: 22, resumo: '' },
    { titulo: 'Justiça do Rio decreta falência do Grupo Refit', veiculo: 'InfoMoney', data: agora, pontuacao: 18, resumo: '' },
    { titulo: 'Marabraz pede recuperação judicial com dívidas de R$ 140 milhões', veiculo: 'G1', data: agora, pontuacao: 15, resumo: '' },
  ];

  const saida = agrupar(entrada);
  const principais = saida.filter((n) => n.principal);

  // Três manchetes do Refit viram um card; a Marabraz continua separada.
  assert.equal(principais.length, 2);

  const refit = principais.find((n) => /refit/i.test(n.titulo));
  assert.equal(refit.cobertura, 3);
  // Vence quem tem resumo, mesmo com pontuação menor.
  assert.equal(refit.veiculo, 'Valor');
  assert.deepEqual(refit.tambemEm.sort(), ['InfoMoney', 'Poder360']);

  const marabraz = principais.find((n) => /marabraz/i.test(n.titulo));
  assert.equal(marabraz.cobertura, undefined);
});

test('agrupar não junta notícias distintas da mesma empresa', () => {
  const agora = new Date().toISOString();
  const saida = agrupar([
    { titulo: 'Casas Bahia pede recuperação judicial', veiculo: 'A', data: agora, pontuacao: 10, resumo: '' },
    { titulo: 'Casas Bahia aprova plano e sai da recuperação judicial', veiculo: 'B', data: agora, pontuacao: 10, resumo: '' },
  ]);
  assert.equal(saida.filter((n) => n.principal).length, 2);
});

test('agrupar separa notícias afastadas no tempo', () => {
  const hoje = new Date().toISOString();
  const antigo = new Date(Date.now() - 30 * 24 * 3600e3).toISOString();
  const saida = agrupar([
    { titulo: 'Refit tem a falência decretada pela Justiça', veiculo: 'A', data: hoje, pontuacao: 10, resumo: '' },
    { titulo: 'Refit tem a falência decretada pela Justiça', veiculo: 'B', data: antigo, pontuacao: 10, resumo: '' },
  ]);
  assert.equal(saida.filter((n) => n.principal).length, 2);
});

test('agrupar junta o mesmo fato narrado com verbos diferentes', () => {
  const agora = new Date().toISOString();
  // Manchetes reais da coleta: quase nenhuma palavra em comum além do nome.
  const saida = agrupar([
    { titulo: 'Justiça de São Paulo aceita recuperação extrajudicial da Braskem', veiculo: 'A', data: agora, pontuacao: 10, resumo: '' },
    { titulo: 'Braskem recebe aval da Justiça para recuperação extrajudicial de dívida', veiculo: 'B', data: agora, pontuacao: 10, resumo: '' },
    { titulo: 'Justiça autoriza recuperação extrajudicial da Braskem', veiculo: 'C', data: agora, pontuacao: 10, resumo: '' },
    { titulo: 'Braskem tem recuperação extrajudicial aprovada para reestruturar dívida', veiculo: 'D', data: agora, pontuacao: 10, resumo: '' },
  ]);

  const principais = saida.filter((n) => n.principal);
  assert.equal(principais.length, 1, 'as quatro narram o mesmo deferimento');
  assert.equal(principais[0].cobertura, 4);
});

test('agrupar separa etapas diferentes do mesmo caso', () => {
  const agora = new Date().toISOString();
  const saida = agrupar([
    { titulo: 'Braskem protocola pedido de recuperação extrajudicial', veiculo: 'A', data: agora, pontuacao: 10, resumo: '' },
    { titulo: 'Justiça aprova a recuperação extrajudicial da Braskem', veiculo: 'B', data: agora, pontuacao: 10, resumo: '' },
  ]);
  // Pedir e ter o pedido deferido são fatos distintos: dois cards.
  assert.equal(saida.filter((n) => n.principal).length, 2);
});

test('empresas ignora instituição e praça, e fica com o nome próprio', () => {
  assert.deepEqual([...empresas('Justiça do Rio decreta falência do Grupo Refit')], ['refit']);
  assert.deepEqual([...empresas('Justiça de São Paulo aceita pedido da Braskem')], ['braskem']);
  assert.equal(empresas('Tribunal de Justiça do Rio de Janeiro decide').size, 0);
});

test('extrairResumo rejeita o texto institucional do Google Notícias', () => {
  // O link do feed leva à página de redirecionamento do Google, cuja
  // og:description é sempre esta — e não fala da matéria.
  const html = `<html><head><meta property="og:description" content="Comprehensive up-to-date news coverage, aggregated from sources all over the world by Google News."></head></html>`;
  assert.equal(extrairResumo(html, 'Justiça defere RJ do Grupo Alfa'), null);
});

test('linkDoVeiculo acha a matéria por trás do redirecionamento', () => {
  const html = `<html><body>
    <a href="https://policies.google.com/privacy">Privacidade</a>
    <a href="https://news.google.com/foo">Mais</a>
    <a href="https://valor.globo.com/empresas/noticia/materia.ghtml">Leia a matéria</a>
  </body></html>`;
  assert.equal(linkDoVeiculo(html), 'https://valor.globo.com/empresas/noticia/materia.ghtml');
});

test('linkDoVeiculo devolve null quando só há links do próprio Google', () => {
  const html = '<html><body><a href="https://support.google.com/news">Ajuda</a></body></html>';
  assert.equal(linkDoVeiculo(html), null);
});

test('urlEmbutidaDoGoogle recupera a matéria codificada no link', () => {
  // Mesmo formato do feed: base64url de bytes com a URL do veículo dentro.
  const bruto = Buffer.concat([
    Buffer.from([0x08, 0x13, 0x22, 0x4a]),
    Buffer.from('https://valor.globo.com/empresas/noticia/braskem.ghtml', 'latin1'),
    Buffer.from([0x00, 0x01]),
  ]);
  const identificador = bruto.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  assert.equal(
    urlEmbutidaDoGoogle(`https://news.google.com/rss/articles/${identificador}`),
    'https://valor.globo.com/empresas/noticia/braskem.ghtml',
  );
  assert.equal(urlEmbutidaDoGoogle('https://valor.globo.com/materia'), null);
  assert.equal(urlEmbutidaDoGoogle('https://news.google.com/rss/articles/abc'), null);
});

test('quando um veículo não tem resumo, a coleta tenta outro do mesmo grupo', async (t) => {
  const LINHA_FINA =
    'A 1ª Vara de Falências decretou a quebra da companhia após a rejeição do plano pelos credores, e nomeou administrador judicial.';

  const paginas = {
    '/sem-resumo': '<html><head><title>x</title></head><body><p>Leia mais.</p></body></html>',
    '/com-og': `<html><head><meta property="og:description" content="${LINHA_FINA}"></head></html>`,
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

  const dir = await mkdtemp(path.join(tmpdir(), 'mural-grupo-'));
  t.after(async () => {
    servidor.close();
    await rm(dir, { recursive: true, force: true });
  });

  // A mesma quebra, contada por dois veículos: só o segundo publica linha fina.
  await writeFile(
    path.join(dir, 'busca.xml'),
    `<rss><channel>
      <item>
        <title>Justiça decreta falência da Alfa Alimentos - Portal A</title>
        <link>http://127.0.0.1:${porta}/sem-resumo</link>
        <pubDate>${new Date().toUTCString()}</pubDate>
      </item>
      <item>
        <title>Alfa Alimentos tem falência decretada pela Justiça - Portal B</title>
        <link>http://127.0.0.1:${porta}/com-og</link>
        <pubDate>${new Date().toUTCString()}</pubDate>
      </item>
    </channel></rss>`,
    'utf-8',
  );

  const saida = path.join(dir, 'noticias.json');
  await executar('node', [COLETOR, '--fixtures', dir, '--dias', '999999', '--saida', saida]);
  const dados = JSON.parse(await readFile(saida, 'utf-8'));

  // Um card só, e com o resumo que existia em apenas um dos dois veículos.
  assert.equal(dados.total, 1);
  const card = dados.noticias.find((n) => n.principal);
  assert.equal(card.cobertura, 2);
  assert.equal(card.resumo, LINHA_FINA);
  assert.equal(card.veiculo, 'Portal B');
});
