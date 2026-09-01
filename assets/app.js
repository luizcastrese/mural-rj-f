/* Mural RJ & Falências — lê dados/noticias.json e monta o mural.
   Sem dependências e sem build: a página abre direto no GitHub Pages.

   Conteúdo de feed é entrada não confiável, então os cards são montados
   via DOM com textContent (nunca innerHTML) e os links passam por uma
   checagem de protocolo. */

const ARQUIVO = 'dados/noticias.json';
const CHAVE_SALVAS = 'mural-rj:salvas';
const CHAVE_TEMA = 'mural-rj:tema';

const estado = {
  noticias: [],
  categorias: [],
  fontes: [],
  categoriaAtiva: 'todas',
  busca: '',
  dias: 7,
  soSalvas: false,
  salvas: new Set(),
  jaColetou: false,
};

const el = {
  atualizacao: document.getElementById('atualizacao'),
  busca: document.getElementById('busca'),
  periodo: document.getElementById('periodo'),
  soSalvas: document.getElementById('so-salvas'),
  contadorSalvas: document.getElementById('contador-salvas'),
  categorias: document.getElementById('categorias'),
  lista: document.getElementById('lista'),
  vazio: document.getElementById('vazio'),
  resultado: document.getElementById('resultado'),
  fontes: document.getElementById('fontes'),
  botaoTema: document.getElementById('botao-tema'),
  iconeTema: document.getElementById('icone-tema'),
};

/* ---------- armazenamento local (pode falhar em modo privativo) ---------- */

function lerArmazenado(chave, padrao) {
  try {
    const bruto = localStorage.getItem(chave);
    return bruto === null ? padrao : JSON.parse(bruto);
  } catch {
    return padrao;
  }
}

function gravarArmazenado(chave, valor) {
  try {
    localStorage.setItem(chave, JSON.stringify(valor));
  } catch {
    /* sem persistência: a sessão continua funcionando normalmente */
  }
}

/* ---------- utilidades ---------- */

function normalizar(texto = '') {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function linkSeguro(url = '') {
  try {
    const alvo = new URL(url, location.href);
    return alvo.protocol === 'http:' || alvo.protocol === 'https:' ? alvo.href : null;
  } catch {
    return null;
  }
}

const FORMATO_DATA = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });

// "24 de ago. de 2026" é longo demais para a linha de metadados; sai "24 ago 2026".
function dataCurta(quando) {
  return FORMATO_DATA.formatToParts(quando)
    .filter((parte) => ['day', 'month', 'year'].includes(parte.type))
    .map((parte) => parte.value.replace('.', ''))
    .join(' ');
}

function dataRelativa(iso) {
  if (!iso) return 'sem data';
  const quando = new Date(iso);
  if (Number.isNaN(quando.getTime())) return 'sem data';

  const minutos = Math.round((Date.now() - quando.getTime()) / 60000);
  if (minutos < 1) return 'agora';
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `há ${horas} h`;
  const dias = Math.round(horas / 24);
  if (dias === 1) return 'ontem';
  if (dias < 8) return `há ${dias} dias`;
  return dataCurta(quando);
}

function idDaNoticia(noticia) {
  return noticia.link || noticia.titulo;
}

function nomeCategoria(id) {
  const achada = estado.categorias.find((c) => c.id === id);
  return achada ? achada.nome : id;
}

/* ---------- tema ---------- */

function aplicarTema(tema) {
  if (tema === 'claro' || tema === 'escuro') {
    document.documentElement.dataset.theme = tema === 'escuro' ? 'dark' : 'light';
    el.iconeTema.textContent = tema === 'escuro' ? '☾' : '☀';
  } else {
    delete document.documentElement.dataset.theme;
    el.iconeTema.textContent = '◐';
  }
}

function alternarTema() {
  const ciclo = ['sistema', 'claro', 'escuro'];
  const atual = lerArmazenado(CHAVE_TEMA, 'sistema');
  const proximo = ciclo[(ciclo.indexOf(atual) + 1) % ciclo.length];
  gravarArmazenado(CHAVE_TEMA, proximo);
  aplicarTema(proximo);
}

/* ---------- filtragem ---------- */

function dentroDoPeriodo(noticia) {
  if (!estado.dias) return true;
  if (!noticia.data) return true;
  const limite = Date.now() - estado.dias * 24 * 60 * 60 * 1000;
  return new Date(noticia.data).getTime() >= limite;
}

// Base do filtro: tudo que passa por período e "salvas". As contagens dos
// chips saem daqui, então elas mudam junto com o período — que é o que o
// leitor quer saber ("o que apareceu esta semana e onde").
function baseFiltrada() {
  return estado.noticias.filter((noticia) => {
    if (!dentroDoPeriodo(noticia)) return false;
    if (estado.soSalvas && !estado.salvas.has(idDaNoticia(noticia))) return false;
    return true;
  });
}

function aplicarBusca(lista) {
  const termo = normalizar(estado.busca.trim());
  if (!termo) return lista;
  const partes = termo.split(/\s+/);
  return lista.filter((noticia) => {
    const alvo = normalizar(
      `${noticia.titulo} ${noticia.resumo} ${noticia.veiculo} ${(noticia.etiquetas || []).join(' ')}`,
    );
    return partes.every((parte) => alvo.includes(parte));
  });
}

function visiveis() {
  const base = aplicarBusca(baseFiltrada());
  return estado.categoriaAtiva === 'todas'
    ? base
    : base.filter((n) => n.categoria === estado.categoriaAtiva);
}

/* ---------- renderização ---------- */

function criarChip({ id, nome, quantidade }) {
  const botao = document.createElement('button');
  botao.type = 'button';
  botao.className = 'chip';
  botao.setAttribute('aria-pressed', String(estado.categoriaAtiva === id));
  if (id !== 'todas') botao.style.setProperty('--cor', `var(--cat-${id})`);

  const rotulo = document.createElement('span');
  rotulo.textContent = nome;
  const qtd = document.createElement('span');
  qtd.className = 'chip-qtd';
  qtd.textContent = String(quantidade);

  botao.append(rotulo, qtd);
  // Clicar na categoria ativa volta para "Todas".
  botao.addEventListener('click', () => {
    estado.categoriaAtiva = estado.categoriaAtiva === id ? 'todas' : id;
    renderizar();
  });
  return botao;
}

function renderizarCategorias() {
  const base = aplicarBusca(baseFiltrada());
  el.categorias.replaceChildren();
  el.categorias.append(criarChip({ id: 'todas', nome: 'Todas', quantidade: base.length }));
  for (const categoria of estado.categorias) {
    el.categorias.append(
      criarChip({
        id: categoria.id,
        nome: categoria.nome,
        quantidade: base.filter((n) => n.categoria === categoria.id).length,
      }),
    );
  }
}

function criarCard(noticia) {
  const card = document.createElement('article');
  card.className = 'card';
  card.style.setProperty('--cor', `var(--cat-${noticia.categoria})`);

  const topo = document.createElement('div');
  topo.className = 'card-topo';

  const categoria = document.createElement('span');
  categoria.className = 'card-categoria';
  categoria.textContent = nomeCategoria(noticia.categoria);

  const id = idDaNoticia(noticia);
  const salvar = document.createElement('button');
  salvar.type = 'button';
  salvar.className = 'salvar';
  const salva = estado.salvas.has(id);
  salvar.setAttribute('aria-pressed', String(salva));
  salvar.setAttribute('aria-label', salva ? 'Remover das salvas' : 'Salvar notícia');
  salvar.textContent = salva ? '★' : '☆';
  salvar.addEventListener('click', () => {
    if (estado.salvas.has(id)) estado.salvas.delete(id);
    else estado.salvas.add(id);
    gravarArmazenado(CHAVE_SALVAS, [...estado.salvas]);
    renderizar();
  });

  topo.append(categoria, salvar);

  const titulo = document.createElement('h2');
  titulo.className = 'card-titulo';
  const href = linkSeguro(noticia.link);
  if (href) {
    const link = document.createElement('a');
    link.href = href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = noticia.titulo;
    titulo.append(link);
  } else {
    titulo.textContent = noticia.titulo;
  }

  card.append(topo, titulo);

  if (noticia.resumo) {
    const resumo = document.createElement('p');
    resumo.className = 'card-resumo';
    resumo.textContent = noticia.resumo;
    card.append(resumo);
  }

  if (noticia.etiquetas && noticia.etiquetas.length) {
    const etiquetas = document.createElement('div');
    etiquetas.className = 'etiquetas';
    for (const nome of noticia.etiquetas) {
      const etiqueta = document.createElement('span');
      etiqueta.className = 'etiqueta';
      etiqueta.textContent = nome;
      etiquetas.append(etiqueta);
    }
    card.append(etiquetas);
  }

  const meta = document.createElement('div');
  meta.className = 'card-meta';
  const veiculo = document.createElement('span');
  veiculo.className = 'card-veiculo';
  veiculo.textContent = noticia.veiculo || 'fonte não identificada';
  const sep = document.createElement('span');
  sep.className = 'sep';
  sep.textContent = '·';
  const quando = document.createElement('span');
  quando.textContent = dataRelativa(noticia.data);
  if (noticia.data) quando.title = new Date(noticia.data).toLocaleString('pt-BR');
  meta.append(veiculo, sep, quando);
  card.append(meta);

  return card;
}

function mostrarVazio(titulo, texto, comando) {
  el.vazio.replaceChildren();
  const h2 = document.createElement('h2');
  h2.textContent = titulo;
  const p = document.createElement('p');
  p.textContent = texto;
  el.vazio.append(h2, p);
  if (comando) {
    const code = document.createElement('code');
    code.textContent = comando;
    el.vazio.append(code);
  }
  el.vazio.hidden = false;
  el.lista.replaceChildren();
}

function renderizar() {
  renderizarCategorias();

  const lista = visiveis();
  el.contadorSalvas.textContent = String(estado.salvas.size);
  el.soSalvas.setAttribute('aria-pressed', String(estado.soSalvas));

  if (!lista.length) {
    const temFiltro = estado.busca.trim() || estado.categoriaAtiva !== 'todas' || estado.soSalvas;
    el.resultado.textContent = '';
    if (!estado.jaColetou) {
      // Primeiro acesso: a base veio com a estrutura, mas sem notícia nenhuma.
      mostrarVazio(
        'O mural ainda não foi carregado',
        'Rode a primeira coleta em Actions → Atualizar mural → Run workflow. Para coletar aqui mesmo, na pasta do projeto:',
        'npm run coletar',
      );
    } else if (estado.soSalvas && !estado.salvas.size) {
      mostrarVazio('Nada salvo ainda', 'Toque na estrela de uma notícia para guardá-la aqui. As salvas ficam neste navegador.');
    } else if (temFiltro) {
      mostrarVazio('Nenhuma notícia com esses filtros', 'Tente ampliar o período, limpar a busca ou voltar para “Todas”.');
    } else {
      mostrarVazio('Nenhuma notícia no período', 'A última coleta não encontrou matérias nesta janela. Amplie o período para “30 dias” ou “Tudo”.');
    }
    return;
  }

  el.vazio.hidden = true;
  const plural = lista.length === 1 ? 'notícia' : 'notícias';
  el.resultado.textContent = `${lista.length} ${plural}`;

  const fragmento = document.createDocumentFragment();
  for (const noticia of lista) fragmento.append(criarCard(noticia));
  el.lista.replaceChildren(fragmento);
}

function renderizarFontes() {
  el.fontes.replaceChildren();
  for (const fonte of estado.fontes) {
    const li = document.createElement('li');
    const pino = document.createElement('span');
    pino.className = `pino ${fonte.ok ? 'ok' : 'falhou'}`;
    pino.textContent = fonte.ok ? '●' : '▲';
    const nome = document.createElement('span');
    nome.textContent = fonte.nome;
    li.append(pino, nome);
    if (fonte.ok) {
      const qtd = document.createElement('span');
      qtd.className = 'fonte-erro';
      qtd.textContent = `${fonte.itens ?? 0}`;
      li.append(qtd);
    } else {
      const erro = document.createElement('span');
      erro.className = 'fonte-erro';
      erro.textContent = fonte.erro || 'indisponível';
      li.append(erro);
    }
    el.fontes.append(li);
  }
}

/* ---------- eventos ---------- */

function ligarEventos() {
  let debounce;
  el.busca.addEventListener('input', (evento) => {
    clearTimeout(debounce);
    const valor = evento.target.value;
    debounce = setTimeout(() => {
      estado.busca = valor;
      renderizar();
    }, 140);
  });

  el.periodo.addEventListener('change', (evento) => {
    estado.dias = Number(evento.target.value);
    renderizar();
  });

  el.soSalvas.addEventListener('click', () => {
    estado.soSalvas = !estado.soSalvas;
    renderizar();
  });

  el.botaoTema.addEventListener('click', alternarTema);

  document.addEventListener('keydown', (evento) => {
    const digitando = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
    if (evento.key === '/' && !digitando) {
      evento.preventDefault();
      el.busca.focus();
    }
    if (evento.key === 'Escape' && document.activeElement === el.busca) {
      el.busca.value = '';
      estado.busca = '';
      renderizar();
    }
  });
}

/* ---------- carregamento ---------- */

async function iniciar() {
  aplicarTema(lerArmazenado(CHAVE_TEMA, 'sistema'));
  estado.salvas = new Set(lerArmazenado(CHAVE_SALVAS, []));
  ligarEventos();

  let dados;
  try {
    const resposta = await fetch(ARQUIVO, { cache: 'no-cache' });
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
    dados = await resposta.json();
  } catch {
    el.atualizacao.textContent = 'sem dados';
    // Abrir o index.html por file:// bloqueia o fetch do JSON; o caminho
    // é servir a pasta, e o comando abaixo resolve sem instalar nada.
    mostrarVazio(
      'Não foi possível carregar as notícias',
      'A página precisa ser servida por HTTP para ler dados/noticias.json. Rode o comando abaixo na pasta do projeto e abra http://localhost:8000.',
      'python3 -m http.server 8000',
    );
    return;
  }

  estado.noticias = Array.isArray(dados.noticias) ? dados.noticias : [];
  estado.categorias = Array.isArray(dados.categorias) ? dados.categorias : [];
  estado.fontes = Array.isArray(dados.fontes) ? dados.fontes : [];
  estado.jaColetou = Boolean(dados.atualizadoEm);

  el.atualizacao.textContent = dados.atualizadoEm
    ? `atualizado ${dataRelativa(dados.atualizadoEm)}\n${estado.noticias.length} notícias na base`
    : `${estado.noticias.length} notícias na base`;

  renderizarFontes();
  renderizar();
}

iniciar();
