export const CATEGORIES = ["Recuperação Judicial", "Falência", "Jurídico"] as const;
export type NewsCategory = (typeof CATEGORIES)[number];
export type Relevance = "Alta" | "Média" | "Baixa";

export interface NewsItem {
  id: string;
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  category: NewsCategory;
  section: "new" | "ongoing" | "bankruptcy" | "legal";
  summary: string;
  relevance: Relevance;
  company?: string;
  createdAt: string;
}

export interface NewsResult {
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  description?: string;
}
