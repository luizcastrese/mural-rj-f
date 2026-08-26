# Radar de Insolvência

MVP de clipping executivo sobre recuperação judicial, falência e jurisprudência relacionada. A homepage prioriza uma leitura de 3 a 5 minutos, com destaques, seções temáticas, busca e filtros simples.

## O que funciona

- interface responsiva com dados de demonstração quando o banco está vazio;
- filtros por hoje, 3 ou 7 dias e pelas categorias Recuperação Judicial, Falência e Jurídico;
- busca local por título, resumo, empresa ou palavra-chave;
- SQLite com criação automática da tabela e script de seed;
- busca real por meio da API GNews, encapsulada pela interface `NewsProvider`;
- classificação por categoria, seção e relevância, sumarização extrativa com limite de 80 palavras e deduplicação por título, empresa e proximidade da data;
- endpoint protegido e cron configurado para atualização a cada 6 horas.

Os textos e links de demonstração são fictícios e existem apenas para visualizar a interface. Quando o banco contém notícias importadas, elas substituem os mocks.

## Requisitos

- Node.js 20 ou superior;
- npm;
- chave da GNews apenas para coleta real.

## Instalação e execução local

```bash
npm install
cp .env.example .env
npm run db:seed       # opcional: persiste os mocks no SQLite
npm run dev
```

Acesse [http://localhost:3000](http://localhost:3000). O arquivo SQLite é criado em `./data/news.db` por padrão.

## APIs e atualização

1. Crie uma chave em [gnews.io](https://gnews.io/).
2. Preencha `GNEWS_API_KEY` no `.env`.
3. Defina um `CRON_SECRET` longo e aleatório.
4. Execute `npm run news:update` para importar manualmente.

O provedor está em `src/lib/news/gnews-provider.ts` e implementa `NewsProvider`. Assim, Tavily, SerpAPI ou Bing podem ser adicionados sem alterar o pipeline. A aplicação **não faz scraping do Google**.

Para simular o cron localmente:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/update
```

O `vercel.json` agenda a chamada a cada seis horas em deploys com suporte a Vercel Cron. Em hospedagem com filesystem efêmero, SQLite não é persistente; para produção, monte um volume persistente ou troque o adaptador de banco.

## Como o pipeline trabalha

1. Executa as consultas editoriais definidas em `src/lib/news/update.ts`.
2. Converte a resposta do provedor para o modelo `NewsItem`.
3. Produz resumo somente a partir do título/descrição recebidos, sem completar fatos externos.
4. Classifica categoria, seção e relevância por regras transparentes.
5. Deduplica acontecimentos próximos antes de salvar com `INSERT OR IGNORE`.

## Verificações

```bash
npm run lint
npm run typecheck
npm run build
```

## Limites do MVP

- A coleta real depende de `GNEWS_API_KEY` e dos limites/termos da GNews.
- A sumarização é extrativa e deliberadamente conservadora; não usa IA generativa nem inventa contexto.
- A classificação e a identificação de empresa são heurísticas simples. O campo de empresa já está no modelo para refinamento posterior.
