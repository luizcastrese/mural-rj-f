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

## De onde vem o resumo

Cada card traz o resumo da matéria para que dê para decidir se vale abrir, sem
gastar tempo. **Esse resumo é sempre texto literal do veículo**: o coletor abre
a página da matéria e copia a linha fina que o próprio jornal publica na
`og:description` — a mesma que aparece quando alguém compartilha o link no
WhatsApp. Ele é reproduzido sem alteração.

Nada nesta base é redigido, condensado ou interpretado por inteligência
artificial. A regra está em `scripts/lib/resumo.mjs` e vale sem exceção:

- Se o veículo publica resumo, ele entra como está.
- Se não publica, ou se a página está atrás de paywall, **o card diz "o veículo
  não publicou resumo — abra a matéria"**, e fica assim.

Chegar até a matéria exige um desvio: o link do feed do Google Notícias aponta
para a página de redirecionamento dele, não para o veículo. O coletor tenta,
nesta ordem, decodificar a URL embutida no próprio link (sai de graça), depois
seguir o primeiro link externo da página de redirecionamento. Só então lê o
resumo. Sem isso, o que se copia é o texto institucional do Google
(*"Comprehensive up-to-date news coverage…"*), que não fala da notícia — ele
está na lista de entulho justamente por ter enchido o mural na primeira coleta.
Quando o desvio falha, o card fica sem resumo, e o link continua levando à
matéria pelo Google.

O motivo é simples: um resumo gerado sobre deferimento de RJ, prazo de stay
period ou tese do STJ pode errar um detalhe que muda a conclusão, e quem lê não
tem como saber que errou. Resumo nenhum é um problema menor do que resumo
plausível e errado. O campo `resumoFonte`, em cada notícia, registra de onde o
texto saiu (`og:description`, `meta description`, `primeiro parágrafo` ou
`feed`), e o card mostra isso ao passar o mouse.

## Colocando no ar (uma vez só)

1. Suba este repositório para o GitHub.
2. Em **Settings → Pages**, no campo *Source*, escolha **GitHub Actions**.
3. Em **Settings → Actions → General**, na seção *Workflow permissions*,
   marque **Read and write permissions** (é o que deixa o robô salvar as
   notícias coletadas).
4. Vá em **Actions → Atualizar mural → Run workflow** para rodar a primeira
   coleta na hora.

Pronto: o endereço aparece ao fim do workflow, no formato
`https://<seu-usuario>.github.io/mural-rj-f/`.

Depois disso a coleta roda sozinha às **7h, 12h e 17h (horário de Brasília),
em dias úteis**. Para mudar o horário, edite o `cron` em
`.github/workflows/atualizar-mural.yml` — lembrando que o GitHub usa UTC.

## Rodando na sua máquina

```bash
npm run coletar      # busca as notícias e atualiza dados/noticias.json
npm run servir       # abre em http://localhost:8000
npm test             # roda a suíte de testes
```

Não há dependências para instalar: usa só o Node 20+ e o `python3` do sistema
para servir os arquivos.

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
