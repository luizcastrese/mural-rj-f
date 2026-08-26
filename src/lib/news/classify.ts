import type { NewsItem, NewsResult } from "@/types/news";

const includes = (text: string, terms: string[]) => terms.some((term) => text.includes(term));

export function classify(result: NewsResult): Pick<NewsItem, "category" | "section" | "relevance"> {
  const text = `${result.title} ${result.description ?? ""}`.toLocaleLowerCase("pt-BR");
  const legal = includes(text, ["stj", "stf", "cnj", "jurisprudência", "lei 11.101", "tribunal"]);
  const bankruptcy = includes(text, ["falência", "falencia", "falimentar"]);
  const fresh = includes(text, ["pedido de recuperação", "pede recuperação", "deferiu", "deferida", "entra em recuperação"]);
  const high = legal || includes(text, ["bilhão", "bilhões", "decretada", "decretou", "grande grupo"]);
  const medium = includes(text, ["milhão", "milhões", "agc", "credores", "upi", "dip", "plano"]);
  return {
    category: legal ? "Jurídico" : bankruptcy ? "Falência" : "Recuperação Judicial",
    section: legal ? "legal" : bankruptcy ? "bankruptcy" : fresh ? "new" : "ongoing",
    relevance: high ? "Alta" : medium ? "Média" : "Baixa",
  };
}
