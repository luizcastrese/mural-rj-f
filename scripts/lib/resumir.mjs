// Escreve o resumo da notícia a partir do texto da matéria.
//
// O coletor entrega aqui o texto que o veículo publicou; o modelo lê e
// escreve o resumo. Isso é resumir, não inventar: a instrução abaixo proíbe
// acrescentar qualquer coisa que não esteja no texto, e manda omitir o dado
// ausente em vez de preenchê-lo.
//
// Provedores, escolhidos pelo que estiver disponível:
//   gemini    — Google AI Studio, chave gratuita e sem cartão. É o padrão.
//   anthropic — Claude, se ANTHROPIC_API_KEY estiver definida. Melhor
//               qualidade, cobrado por uso.
//   github    — GitHub Models. Mantido só por compatibilidade: o serviço
//               entrou em desativação programada e responde HTTP 410.
// Sem nenhum deles, o coletor não chama nada e cai no recorte de frases da
// própria matéria: o mural continua funcionando, com resumo mais cru.

const GITHUB_MODELS = 'https://models.github.ai/inference/chat/completions';
// MURAL_GEMINI_URL existe para os testes apontarem a um servidor local.
const GEMINI = process.env.MURAL_GEMINI_URL || 'https://generativelanguage.googleapis.com/v1beta/models';
// Os nomes de modelo do Gemini mudam de tempos em tempos; na primeira falha
// de "modelo não encontrado" o coletor tenta o seguinte e memoriza o que
// funcionou, em vez de desistir da coleta inteira.
const MODELOS_GEMINI = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-flash-latest'];
const MAX_CARACTERES_MATERIA = 12000;
const MIN_CARACTERES_MATERIA = 200;
const MAX_CARACTERES_RESUMO = 420;
const TEMPO_LIMITE_MS = 30000;
// 503 e 429 são fila cheia do outro lado, não erro do pedido: espera e tenta
// de novo antes de desistir e cair no recorte.
const ESPERAS_MS = (process.env.MURAL_ESPERAS_MS || '5000,15000,30000')
  .split(',')
  .map(Number);
// A cota gratuita conta chamadas por minuto. O coletor busca vários grupos em
// paralelo, então as chamadas ao modelo passam por uma fila de um de cada vez,
// espaçadas — sem isso, seis pedidos simultâneos estouram o limite na hora.
const ESPACO_ENTRE_CHAMADAS_MS = Number(process.env.MURAL_ESPACO_MS || 6500);
const TRANSITORIOS = new Set([429, 500, 502, 503, 504]);

export class FalhaTransitoria extends Error {}

const dormir = (ms) => new Promise((pronto) => setTimeout(pronto, ms));

// Fila de uma chamada por vez, com intervalo mínimo entre elas.
let fila = Promise.resolve();
let ultimaChamada = 0;

function enfileirar(tarefa) {
  const proxima = fila.then(async () => {
    const desde = Date.now() - ultimaChamada;
    if (desde < ESPACO_ENTRE_CHAMADAS_MS) await dormir(ESPACO_ENTRE_CHAMADAS_MS - desde);
    ultimaChamada = Date.now();
    return tarefa();
  });
  // A fila não pode parar por causa de uma falha na tarefa anterior.
  fila = proxima.catch(() => {});
  return proxima;
}

const INSTRUCAO = `Você prepara um mural de notícias para advogados que atuam com recuperação judicial e falência no Brasil. Recebe o texto de uma matéria e escreve o resumo dela.

O resumo serve para o leitor decidir, em poucos segundos, se precisa abrir a matéria — e para que, se não abrir, saia sabendo o que aconteceu.

Regras, sem exceção:
- Use apenas o que está no texto recebido. Não acrescente contexto, não infira, não conclua, não explique institutos jurídicos.
- Dado que não estiver no texto deve ser omitido, jamais preenchido ou estimado.
- Priorize, quando o texto trouxer: a empresa ou grupo, a etapa do processo (pedido, deferimento, quebra decretada, plano, blindagem, encerramento), o juízo ou tribunal, os valores, os prazos e o que foi decidido.
- Deixe de fora o que não informa: "procurada, a empresa não se manifestou", histórico da companhia, cotação de ações.
- Duas a três frases, no máximo 400 caracteres, em português do Brasil.
- Não comece com "A notícia informa", "A matéria trata" ou variantes, e não repita a manchete.
- Responda somente com o resumo, sem preâmbulo, aspas ou marcação.`;

function chaveGemini() {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
}

export function provedorDoResumo() {
  const escolhido = process.env.MURAL_PROVEDOR;
  if (escolhido) return escolhido;
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (chaveGemini()) return 'gemini';
  // GitHub Models não entra por descoberta: está em desativação e responde
  // HTTP 410. Auto-selecioná-lo fazia o coletor se declarar capaz de escrever
  // resumo sem conseguir escrever nenhum. Só por MURAL_PROVEDOR=github.
  return 'nenhum';
}

export function podeResumirComModelo() {
  const provedor = provedorDoResumo();
  if (provedor === 'anthropic') return Boolean(process.env.ANTHROPIC_API_KEY);
  if (provedor === 'gemini') return Boolean(chaveGemini());
  if (provedor === 'github') return Boolean(process.env.GITHUB_TOKEN);
  return false;
}

function modelo() {
  if (process.env.MURAL_MODELO) return process.env.MURAL_MODELO;
  if (provedorDoResumo() === 'anthropic') return 'claude-opus-5';
  if (provedorDoResumo() === 'gemini') return modeloGeminiAtual || MODELOS_GEMINI[0];
  return 'openai/gpt-4o-mini';
}

function pedido(titulo, corpo, cortada) {
  return `Manchete: ${titulo}\n\nTexto da matéria${cortada ? ' (início)' : ''}:\n${corpo}`;
}

// GitHub Models fala o formato de chat completions; basta uma requisição.
async function viaGitHub(titulo, corpo, cortada) {
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), TEMPO_LIMITE_MS);
  try {
    const resposta = await fetch(GITHUB_MODELS, {
      method: 'POST',
      signal: controle.signal,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        accept: 'application/json',
      },
      body: JSON.stringify({
        model: modelo(),
        temperature: 0.2,
        max_tokens: 400,
        messages: [
          { role: 'system', content: INSTRUCAO },
          { role: 'user', content: pedido(titulo, corpo, cortada) },
        ],
      }),
    });

    if (!resposta.ok) {
      // O corpo do erro diz se foi cota, permissão ou nome de modelo errado.
      const detalhe = (await resposta.text()).slice(0, 300);
      throw new Error(`GitHub Models HTTP ${resposta.status}: ${detalhe}`);
    }

    const dados = await resposta.json();
    return dados?.choices?.[0]?.message?.content?.trim() || '';
  } finally {
    clearTimeout(relogio);
  }
}

let modeloGeminiAtual = null;

async function chamarGemini(nomeDoModelo, titulo, corpo, cortada) {
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), TEMPO_LIMITE_MS);
  try {
    const base = process.env.MURAL_GEMINI_URL || GEMINI;
    const resposta = await fetch(`${base}/${nomeDoModelo}:generateContent`, {
      method: 'POST',
      signal: controle.signal,
      headers: { 'content-type': 'application/json', 'x-goog-api-key': chaveGemini() },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: INSTRUCAO }] },
        contents: [{ role: 'user', parts: [{ text: pedido(titulo, corpo, cortada) }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 400 },
      }),
    });

    if (!resposta.ok) {
      const detalhe = (await resposta.text()).slice(0, 300);
      const erro = TRANSITORIOS.has(resposta.status)
        ? new FalhaTransitoria(`Gemini HTTP ${resposta.status}: ${detalhe}`)
        : new Error(`Gemini HTTP ${resposta.status}: ${detalhe}`);
      erro.status = resposta.status;
      const esperaPedida = Number(resposta.headers.get('retry-after'));
      if (Number.isFinite(esperaPedida) && esperaPedida > 0) erro.esperaMs = esperaPedida * 1000;
      throw erro;
    }

    const dados = await resposta.json();
    return (dados?.candidates?.[0]?.content?.parts || [])
      .map((parte) => parte.text || '')
      .join(' ')
      .trim();
  } finally {
    clearTimeout(relogio);
  }
}

async function viaGemini(titulo, corpo, cortada) {
  // Modelo pedido explicitamente é respeitado como está. Sem isso, começa
  // pelo que funcionou da última vez e mantém a lista como reserva — um nome
  // pode ser aposentado no meio de uma coleta.
  const tentativas = process.env.MURAL_MODELO
    ? [process.env.MURAL_MODELO]
    : [...new Set([modeloGeminiAtual, ...MODELOS_GEMINI].filter(Boolean))];

  let ultimoErro = null;
  for (const nome of tentativas) {
    for (let volta = 0; volta <= ESPERAS_MS.length; volta += 1) {
      try {
        const escrito = await chamarGemini(nome, titulo, corpo, cortada);
        modeloGeminiAtual = nome;
        return escrito;
      } catch (erro) {
        ultimoErro = erro;
        // Fila cheia do outro lado: espera e insiste com o mesmo modelo.
        if (erro instanceof FalhaTransitoria && volta < ESPERAS_MS.length) {
          await dormir(erro.esperaMs || ESPERAS_MS[volta]);
          continue;
        }
        // Nome de modelo inválido: vale tentar o próximo da lista. Qualquer
        // outra falha (cota, chave, rede) é do pedido, não do nome.
        if (erro.status !== 404 && erro.status !== 400) throw erro;
        break;
      }
    }
  }
  throw ultimoErro;
}

let clienteAnthropic = null;

async function viaAnthropic(titulo, corpo, cortada) {
  if (!clienteAnthropic) {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    clienteAnthropic = new Anthropic();
  }

  const resposta = await clienteAnthropic.messages.create({
    model: modelo(),
    max_tokens: 1000,
    system: INSTRUCAO,
    // Resumo de notícia é tarefa direta: esforço baixo entrega o mesmo.
    output_config: { effort: 'low' },
    messages: [{ role: 'user', content: pedido(titulo, corpo, cortada) }],
  });

  if (resposta.stop_reason === 'refusal') return '';
  return resposta.content
    .filter((bloco) => bloco.type === 'text')
    .map((bloco) => bloco.text)
    .join(' ')
    .trim();
}

/**
 * @param {{titulo:string, texto:string}} materia
 * @returns {Promise<{texto:string, origem:string}|null>}
 */
export async function resumirMateria({ titulo, texto }) {
  if (!podeResumirComModelo()) return null;
  if (!texto || texto.length < MIN_CARACTERES_MATERIA) return null;

  // Matéria longa entra pelo começo, que é onde o fato está; o corte é
  // declarado ao modelo para que ele não trate o fim como conclusão.
  const cortada = texto.length > MAX_CARACTERES_MATERIA;
  const corpo = cortada ? texto.slice(0, MAX_CARACTERES_MATERIA) : texto;

  const provedor = provedorDoResumo();
  const escrito = await enfileirar(() => {
    if (provedor === 'anthropic') return viaAnthropic(titulo, corpo, cortada);
    if (provedor === 'gemini') return viaGemini(titulo, corpo, cortada);
    return viaGitHub(titulo, corpo, cortada);
  });

  if (escrito.length < 60) return null;
  return {
    texto: escrito.slice(0, MAX_CARACTERES_RESUMO).trim(),
    origem: 'resumo da matéria',
  };
}
