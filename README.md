# Mural RJ & Falências

Página única que reúne, em um lugar só, as notícias de **recuperação judicial,
falência e insolvência** — novas RJs deferidas, quebras decretadas, o que os
tribunais vêm decidindo e o que muda na lei.

Feita para ser aberta em trinta segundos entre um compromisso e outro: sem
login, sem newsletter, sem app. A coleta roda sozinha no GitHub Actions e a
página é servida pelo GitHub Pages, sem servidor e sem custo.

## Como fica organizado

As matérias entram em cinco eixos, definidos em `scripts/lib/classificar.mjs`:

| Eixo | O que cai aqui |
| --- | --- |
| **Novos casos** | Pedidos, deferimentos e recuperações extrajudiciais |
| **Falências** | Quebras decretadas, convolações e massas falidas |
| **Jurisprudência** | STJ, STF e tribunais — teses, repetitivos e acórdãos |
| **Legislação** | Projetos, reformas e regulamentação |
| **Mercado & Casos** | Planos, assembleias, credores e reestruturações |

Na página dá para buscar por texto livre (empresa, tribunal, tema), filtrar por
eixo e por período (24 h, 7 ou 30 dias) e salvar manchetes com a estrela — as
salvas ficam guardadas no próprio navegador, sem cadastro.

## O que entra no mural

Ser do tema não basta para ocupar espaço. Entra o que **noticia um fato**:

- uma etapa do processo — pedido, deferimento, quebra decretada, blindagem
  concedida, plano apresentado, aprovado ou contestado, encerramento;
- uma **decisão com conteúdo** — tese do STJ, repetitivo, súmula, acórdão;
- uma **mudança na lei** — projeto, reforma, sanção, entrada em vigor.

Fica de fora o que cita insolvência sem informar nada novo: "entenda a
diferença entre recuperação judicial e falência", coluna de opinião,
comentário de analista, divulgação de curso e manchete-isca. Sobre a coleta
real, a barra descartou 20% das notícias, e o balde genérico "Mercado & Casos"
caiu de 55% para 30% do mural.

A regra está em `classificar()`, em `scripts/lib/classificar.mjs`: a lista
`EVENTOS` define os fatos reconhecidos e `RUIDO_EDITORIAL`, o que é isca. Se
algum assunto seu estiver ficando de fora, é ali que se acrescenta.

## Uma notícia, um card

Um deferimento relevante sai em dez portais no mesmo dia, cada um com a
manchete escrita de um jeito. Na primeira coleta real, o pedido de recuperação
extrajudicial da Braskem apareceu 29 vezes e a falência do Grupo Refit, 13 —
o mural repetiria a mesma notícia dezenas de vezes.

`scripts/lib/agrupar.mjs` junta essas manchetes em um card só e mostra
**"+28 veículos"** na linha de metadados, com a lista completa ao passar o
mouse. A quantidade de veículos vira informação útil: notícia em trinta lugares
é notícia grande.

O agrupamento não compara palavras — manchetes do mesmo fato usam verbos
diferentes ("Justiça *aceita*", "Braskem *recebe aval*", "Justiça *autoriza*")
e quase não se sobrepõem. Ele compara **empresa + etapa do processo + janela de
cinco dias**. Por isso "Braskem protocola pedido" e "Justiça aprova o pedido da
Braskem" continuam sendo dois cards: são fatos distintos, e cada um é notícia
por si. Na coleta real isso reduziu 289 notícias a 161 cards, 44% a menos para
ler.

## Sem resumo, não entra

O mural existe para informar sem obrigar a abrir a matéria. Por isso a regra
é dura: **notícia sem resumo não vira card**. Ela não é perdida — fica no
acervo e é tentada de novo a cada coleta —, mas não ocupa espaço na página
enquanto não tiver o que dizer.

Isso tem uma consequência que vale entender. Pelas buscas do Google Notícias
**não se alcança o texto da matéria**: o link para numa página de
redirecionamento que não contém link algum para o veículo, e o identificador
está em formato criptografado. Medido no runner, com 99 notícias buscadas: 0
resumos. Elas continuam sendo coletadas porque medem a repercussão de um fato
(o "+N veículos" do card) e porque o agrupamento pode encontrar a mesma
notícia publicada por um feed direto — aí o card passa a ser o desse veículo.

Quem sustenta o mural são os 13 **feeds diretos**, que entregam link do
próprio veículo e texto legível. Estão em `fontes.json`, e o estado de cada
um na última verificação fica em `dados/diagnostico-fontes.txt`.

## De onde vem o resumo

O resumo é **escrito a partir do texto da matéria**. O coletor abre a página,
extrai o texto que o veículo publicou e entrega esse texto ao modelo, que lê
e escreve o resumo — duas ou três frases, priorizando empresa, etapa do
processo, juízo, valores, prazos e o que foi decidido.

A instrução do modelo (em `scripts/lib/resumir.mjs`) é restritiva de
propósito: usar apenas o que está no texto, não inferir, não concluir, não
explicar institutos jurídicos, e **omitir o dado que não estiver lá em vez de
preenchê-lo**. Resumir uma matéria cujo texto se tem em mãos não é inventar;
inventar seria completar lacuna, e é isso que a instrução proíbe.

**Isso exige uma chave da API da Anthropic**, guardada como segredo do
repositório em `ANTHROPIC_API_KEY` (Settings → Secrets and variables →
Actions → New repository secret). Sem ela o coletor não chama nada, avisa no
log e cai no recorte: escolhe as frases da própria matéria que mais informam.
O mural continua funcionando, com resumo mais cru.

Para trocar o modelo, defina a variável `MURAL_MODELO` (o padrão é
`claude-opus-5`).

## Colocando no ar## Colocando no ar (uma vez só)

1. Suba este repositório para o GitHub.
2. Em **Settings → Pages**, no campo *Source*, escolha **GitHub Actions**.
3. Em **Settings → Actions → General**, na seção *Workflow permissions*,
   marque **Read and write permissions** (é o que deixa o robô salvar as
   notícias coletadas).
4. Vá em **Actions → Atualizar mural → Run workflow** para rodar a primeira
   coleta na hora.

Pronto: o endereço aparece ao fim do workflow, no formato
`https://<seu-usuario>.github.io/mural-rj-f/`.

Depois disso a coleta roda sozinha **todo dia às 7h de Brasília**. Diária, e
não semanal, por uma razão prática: metade dos feeds expõe só os dez últimos
itens — poucas horas de notícia —, então uma coleta por semana enxergaria o
último dia e perderia os outros seis. O custo é desprezível: cada execução
leva cerca de 40 segundos, e Actions em repositório público não é cobrado.
Você continua lendo o mural quando quiser; o acervo se acumula.

Commits no repositório apenas republicam o site, sem coletar de novo. Para
mudar o horário, edite o `cron` em `.github/workflows/atualizar-mural.yml` —
lembrando que o GitHub usa UTC.

## Rodando na sua máquina

```bash
npm ci               # instala o SDK da Anthropic
npm run coletar      # busca as notícias e atualiza dados/noticias.json
npm run servir       # abre em http://localhost:8000
npm test             # roda a suíte de testes
```

A única dependência é o SDK da Anthropic, usado para escrever os resumos
(`npm ci`). Para servir a página basta o `python3` do sistema.

> A página precisa ser servida por HTTP. Abrir o `index.html` com dois cliques
> (`file://`) faz o navegador bloquear a leitura do JSON — por isso o
> `npm run servir`.

## Ajustando às suas fontes

**Trocar ou acrescentar fontes:** edite `fontes.json`. Há dois tipos:

- `buscasGoogleNews` — buscas no Google Notícias, que varrem a imprensa
  regional inteira. É de onde vem a maior parte das novas RJs, já que
  deferimento de comarca do interior raramente sai na imprensa nacional.
- `feedsDiretos` — RSS de portais jurídicos (Conjur e JOTA).

Os feeds diretos de Migalhas e STJ foram removidos depois da primeira coleta
real: retornavam 404 e 403. O conteúdo dos dois continua chegando pelas buscas
do Google Notícias — Migalhas aparece entre os veículos coletados.

Fonte que sair do ar não derruba a atualização: ela é pulada e o motivo
aparece em **"Fontes desta coleta"**, no rodapé da página. Se um desses
endereços mudar, é ali que você vai notar.

**Afinar o que é relevante:** os termos e seus pesos estão em
`scripts/lib/classificar.mjs`. Cada eixo é uma lista de expressões com peso;
ganha o eixo de maior pontuação. Para acompanhar um assunto específico
(consolidação substancial, crédito fiscal, produtor rural), acrescente o termo
na lista `ETIQUETAS` e ele passa a virar etiqueta nos cards.

O filtro também derruba os falsos positivos de "falência" — falência múltipla
de órgãos, falência moral, falência da segurança pública — que sujariam o
mural todo dia. A lista está em `FALSOS_POSITIVOS`, no mesmo arquivo.

## Como a coleta funciona

`scripts/coletar.mjs` busca os feeds em paralelo, normaliza cada item, aplica o
filtro de relevância, deduplica manchetes repetidas (a mesma notícia chega por
várias buscas — fica a versão de maior pontuação) e grava tudo em
`dados/noticias.json`, o único arquivo que a página lê.

Depois disso, abre a página de cada matéria nova para copiar o resumo do
veículo (no máximo 80 por rodada, 6 em paralelo, 12 s de limite cada). Matéria
que já foi tentada não é buscada de novo, e falha na busca do resumo nunca
derruba a notícia — ela entra sem resumo.

Cada coleta **soma ao que já existe** em vez de substituir. Isso importa por
dois motivos: feeds só mostram os últimos itens, então sem isso a notícia de
anteontem sumiria do mural; e uma coleta em que todas as fontes falhem deixa a
página intacta, em vez de zerá-la. O acervo é podado pela janela de retenção
(60 dias por padrão, ajustável com `--dias`).

```bash
node scripts/coletar.mjs --dias 90       # retenção maior
node scripts/coletar.mjs --reconstruir   # descarta o acervo e recomeça
node scripts/coletar.mjs --fixtures      # lê fixtures/, sem rede
node scripts/coletar.mjs --sem-resumos   # não abre as páginas das matérias
```

## Limites que vale conhecer

O acervo guarda até 900 notícias, dimensionado sobre a coleta real (a primeira
rodada trouxe 289 de uma vez). O JSON é servido comprimido, o que mantém o peso
em torno de 260 KB no pior caso.

Nem toda matéria vem com resumo. Veículos atrás de paywall costumam bloquear a
leitura da página, e alguns não publicam linha fina — nesses casos o card
aparece sem resumo, com a manchete e o link. Pela regra acima, isso é
deliberado.

Isto é um agregador de imprensa, não uma fonte oficial. A coleta enxerga o
que os veículos publicam — uma RJ deferida que não virou notícia não aparece
aqui, e o mural não substitui o acompanhamento processual, o Diário Oficial
nem a leitura do inteiro teor das decisões. Para monitoramento com valor
processual, o caminho continua sendo o sistema do tribunal ou um serviço de
acompanhamento de publicações.
