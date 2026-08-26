import { createHash } from "node:crypto";
import { saveNews } from "@/lib/db";
import type { NewsItem, NewsResult } from "@/types/news";
import type { NewsProvider } from "./provider";
import { GNewsProvider } from "./gnews-provider";
import { summarize } from "./summarize";
import { classify } from "./classify";
import { deduplicate } from "./deduplicate";

export const SEARCH_QUERIES = ["recuperação judicial", "pedido de recuperação judicial", "recuperação judicial deferida", "falência decretada", "pedido de falência", "STJ recuperação judicial", "jurisprudência recuperação judicial", "Lei 11.101", "DIP recuperação judicial", "UPI recuperação judicial", "assembleia geral de credores"];

const toItem = (result: NewsResult): NewsItem => ({
  id: createHash("sha256").update(result.url).digest("hex").slice(0, 20),
  ...result, ...classify(result), summary: summarize(result.title, result.description),
  createdAt: new Date().toISOString(),
});

export async function updateNews(provider?: NewsProvider): Promise<number> {
  const selected = provider ?? (process.env.GNEWS_API_KEY ? new GNewsProvider(process.env.GNEWS_API_KEY) : null);
  if (!selected) throw new Error("GNEWS_API_KEY não configurada");
  const settled = await Promise.allSettled(SEARCH_QUERIES.map((query) => selected.search(query)));
  const results = settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  if (!results.length) throw new Error("Nenhum resultado retornado pelo provedor");
  const items = deduplicate(results.map(toItem));
  saveNews(items);
  return items.length;
}
