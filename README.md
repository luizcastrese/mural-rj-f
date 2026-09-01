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
| **Novas RJs** | Pedidos ajuizados e processamentos deferidos |
| **Falências** | Quebras decretadas, convolações e massas falidas |
| **Jurisprudência** | STJ, STF e tribunais — teses, repetitivos e acórdãos |
| **Legislação** | Projetos, reformas e regulamentação |
| **Mercado & Casos** | Planos, assembleias, credores e reestruturações |

Na página dá para buscar por texto livre (empresa, tribunal, tema), filtrar por
eixo e por período (24 h, 7 ou 30 dias) e salvar manchetes com a estrela — as
salvas ficam guardadas no próprio navegador, sem cadastro.

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
- `feedsDiretos` — RSS de portais jurídicos (Conjur, JOTA, Migalhas, STJ).

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

Cada coleta **soma ao que já existe** em vez de substituir. Isso importa por
dois motivos: feeds só mostram os últimos itens, então sem isso a notícia de
anteontem sumiria do mural; e uma coleta em que todas as fontes falhem deixa a
página intacta, em vez de zerá-la. O acervo é podado pela janela de retenção
(60 dias por padrão, ajustável com `--dias`).

```bash
node scripts/coletar.mjs --dias 90       # retenção maior
node scripts/coletar.mjs --reconstruir   # descarta o acervo e recomeça
node scripts/coletar.mjs --fixtures      # lê fixtures/, sem rede
```

## Limites que vale conhecer

Isto é um agregador de imprensa, não uma fonte oficial. A coleta enxerga o
que os veículos publicam — uma RJ deferida que não virou notícia não aparece
aqui, e o mural não substitui o acompanhamento processual, o Diário Oficial
nem a leitura do inteiro teor das decisões. Para monitoramento com valor
processual, o caminho continua sendo o sistema do tribunal ou um serviço de
acompanhamento de publicações.
