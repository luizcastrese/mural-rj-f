import type { NewsItem } from "@/types/news";

const now = new Date();
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();

export const mockNews: NewsItem[] = [
  {
    id: "mock-1", title: "Justiça defere processamento da recuperação judicial do Grupo Horizonte", url: "https://example.com/grupo-horizonte", source: "Valor Econômico", publishedAt: daysAgo(0), category: "Recuperação Judicial", section: "new", relevance: "Alta", company: "Grupo Horizonte", createdAt: daysAgo(0),
    summary: "A Justiça deferiu o processamento da recuperação judicial do Grupo Horizonte. A decisão dá início à fase de negociação com credores e determina a apresentação da relação consolidada de dívidas.",
  },
  {
    id: "mock-2", title: "STJ delimita alcance de garantia em recuperação judicial", url: "https://example.com/stj-garantia", source: "Migalhas", publishedAt: daysAgo(0), category: "Jurídico", section: "legal", relevance: "Alta", createdAt: daysAgo(0),
    summary: "O STJ analisou os efeitos de uma garantia sobre crédito sujeito à recuperação judicial. O julgamento orienta a aplicação da Lei 11.101/2005 em controvérsias semelhantes.",
  },
  {
    id: "mock-3", title: "Credores aprovam plano de recuperação da Vértice Logística", url: "https://example.com/vertice-agc", source: "Estadão", publishedAt: daysAgo(1), category: "Recuperação Judicial", section: "ongoing", relevance: "Alta", company: "Vértice Logística", createdAt: daysAgo(1),
    summary: "A assembleia geral de credores aprovou o plano da Vértice Logística. A proposta prevê novos prazos de pagamento e venda de ativos não estratégicos, sujeita à homologação judicial.",
  },
  {
    id: "mock-4", title: "Rede Aurora apresenta pedido de recuperação judicial", url: "https://example.com/rede-aurora", source: "Exame", publishedAt: daysAgo(1), category: "Recuperação Judicial", section: "new", relevance: "Alta", company: "Rede Aurora", createdAt: daysAgo(1),
    summary: "A Rede Aurora protocolou pedido de recuperação judicial após renegociações com credores. A companhia busca preservar suas operações enquanto estrutura um plano para o passivo informado no processo.",
  },
  {
    id: "mock-5", title: "Tribunal autoriza venda de UPI no processo da Metalúrgica Atlas", url: "https://example.com/atlas-upi", source: "JOTA", publishedAt: daysAgo(2), category: "Recuperação Judicial", section: "ongoing", relevance: "Média", company: "Metalúrgica Atlas", createdAt: daysAgo(2),
    summary: "O tribunal autorizou a abertura do processo competitivo para venda de uma UPI da Metalúrgica Atlas. Os recursos deverão reforçar o caixa e financiar o cumprimento do plano.",
  },
  {
    id: "mock-6", title: "Falência da Construtora Pontal é decretada após descumprimento de plano", url: "https://example.com/pontal-falencia", source: "Diário do Comércio", publishedAt: daysAgo(2), category: "Falência", section: "bankruptcy", relevance: "Alta", company: "Construtora Pontal", createdAt: daysAgo(2),
    summary: "A recuperação da Construtora Pontal foi convolada em falência após o juízo apontar descumprimento do plano. Um administrador judicial conduzirá a arrecadação de bens e habilitação de créditos.",
  },
  {
    id: "mock-7", title: "CNJ atualiza recomendação para varas empresariais", url: "https://example.com/cnj-varas", source: "ConJur", publishedAt: daysAgo(3), category: "Jurídico", section: "legal", relevance: "Média", createdAt: daysAgo(3),
    summary: "O CNJ atualizou orientações administrativas dirigidas às varas empresariais. O texto trata da condução de processos de insolvência e da padronização de informações processuais.",
  },
  {
    id: "mock-8", title: "Empresa de energia obtém financiamento DIP", url: "https://example.com/dip-energia", source: "Pipeline", publishedAt: daysAgo(5), category: "Recuperação Judicial", section: "ongoing", relevance: "Média", company: "Solare Energia", createdAt: daysAgo(5),
    summary: "A Solare Energia obteve autorização para contratar financiamento DIP durante sua recuperação judicial. O crédito será destinado à manutenção das operações e terá garantias aprovadas pelo juízo.",
  },
  {
    id: "mock-9", title: "Credor protocola pedido de falência de distribuidora regional", url: "https://example.com/pedido-falencia", source: "Broadcast", publishedAt: daysAgo(6), category: "Falência", section: "bankruptcy", relevance: "Baixa", company: "Distribuidora Central", createdAt: daysAgo(6),
    summary: "Um credor protocolou pedido de falência da Distribuidora Central por dívida vencida. O pedido ainda será analisado, e a empresa poderá apresentar defesa nos autos.",
  },
];
