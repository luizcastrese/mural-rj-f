// Escreve o resumo da notícia a partir do texto da matéria.
//
// O coletor entrega aqui o texto que o veículo publicou; o modelo lê e
// escreve o resumo. Isso é resumir, não inventar: a instrução abaixo proíbe
// acrescentar qualquer coisa que não esteja no texto, e o que não estiver
// lá deve ser omitido, nunca completado.
//
// Sem ANTHROPIC_API_KEY o coletor não chama nada e cai no recorte de frases
// da própria matéria — o mural continua funcionando, com resumo mais cru.

import Anthropic from '@anthropic-ai/sdk';

const MODELO = process.env.MURAL_MODELO || 'claude-opus-5';
const MAX_CARACTERES_MATERIA = 12000;
const MIN_CARACTERES_MATERIA = 200;

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

let clienteMemorizado = null;

export function podeResumirComModelo() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function cliente() {
  if (!clienteMemorizado) clienteMemorizado = new Anthropic();
  return clienteMemorizado;
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

  const resposta = await cliente().messages.create({
    model: MODELO,
    max_tokens: 1000,
    system: INSTRUCAO,
    // Resumo de notícia é tarefa direta: esforço baixo entrega o mesmo e
    // custa uma fração.
    output_config: { effort: 'low' },
    messages: [
      {
        role: 'user',
        content: `Manchete: ${titulo}\n\nTexto da matéria${cortada ? ' (início)' : ''}:\n${corpo}`,
      },
    ],
  });

  if (resposta.stop_reason === 'refusal') return null;

  const escrito = resposta.content
    .filter((bloco) => bloco.type === 'text')
    .map((bloco) => bloco.text)
    .join(' ')
    .trim();

  return escrito.length >= 60 ? { texto: escrito, origem: 'resumo da matéria' } : null;
}
