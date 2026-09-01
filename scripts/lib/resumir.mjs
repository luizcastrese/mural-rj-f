// Escreve o resumo da notícia a partir do texto da matéria.
//
// O coletor entrega aqui o texto que o veículo publicou; o modelo lê e
// escreve o resumo. Isso é resumir, não inventar: a instrução abaixo proíbe
// acrescentar qualquer coisa que não esteja no texto, e manda omitir o dado
// ausente em vez de preenchê-lo.
//
// Dois provedores, escolhidos pelo que estiver disponível:
//   github    — GitHub Models, gratuito e autenticado pelo GITHUB_TOKEN que o
//               workflow já tem. É o padrão.
//   anthropic — Claude, se ANTHROPIC_API_KEY estiver definida.
// Sem nenhum dos dois, o coletor não chama nada e cai no recorte de frases da
// própria matéria: o mural continua funcionando, com resumo mais cru.

const GITHUB_MODELS = 'https://models.github.ai/inference/chat/completions';
const MAX_CARACTERES_MATERIA = 12000;
const MIN_CARACTERES_MATERIA = 200;
const MAX_CARACTERES_RESUMO = 420;
const TEMPO_LIMITE_MS = 30000;

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

export function provedorDoResumo() {
  const escolhido = process.env.MURAL_PROVEDOR;
  if (escolhido) return escolhido;
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.GITHUB_TOKEN) return 'github';
  return 'nenhum';
}

export function podeResumirComModelo() {
  const provedor = provedorDoResumo();
  if (provedor === 'anthropic') return Boolean(process.env.ANTHROPIC_API_KEY);
  if (provedor === 'github') return Boolean(process.env.GITHUB_TOKEN);
  return false;
}

function modelo() {
  if (process.env.MURAL_MODELO) return process.env.MURAL_MODELO;
  return provedorDoResumo() === 'anthropic' ? 'claude-opus-5' : 'openai/gpt-4o-mini';
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

  const escrito =
    provedorDoResumo() === 'anthropic'
      ? await viaAnthropic(titulo, corpo, cortada)
      : await viaGitHub(titulo, corpo, cortada);

  if (escrito.length < 60) return null;
  return {
    texto: escrito.slice(0, MAX_CARACTERES_RESUMO).trim(),
    origem: 'resumo da matéria',
  };
}
