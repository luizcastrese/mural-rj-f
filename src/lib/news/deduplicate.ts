import type { NewsItem } from "@/types/news";

const normalize = (value: string) => value.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, "");
const tokens = (value: string) => new Set(normalize(value).split(/\s+/).filter((word) => word.length > 3));

function titleSimilarity(a: string, b: string) {
  const left = tokens(a); const right = tokens(b);
  const intersection = [...left].filter((word) => right.has(word)).length;
  return intersection / Math.max(new Set([...left, ...right]).size, 1);
}

export function deduplicate(items: NewsItem[]): NewsItem[] {
  const weight = { Alta: 3, Média: 2, Baixa: 1 };
  return [...items].sort((a, b) => weight[b.relevance] - weight[a.relevance]).filter((candidate, index, all) =>
    !all.slice(0, index).some((kept) => {
      const days = Math.abs(Date.parse(kept.publishedAt) - Date.parse(candidate.publishedAt)) / 86_400_000;
      const sameCompany = Boolean(candidate.company && kept.company && normalize(candidate.company) === normalize(kept.company));
      return days <= 2 && (sameCompany || titleSimilarity(kept.title, candidate.title) >= 0.55);
    }),
  );
}
