import type { NewsResult } from "@/types/news";
import type { NewsProvider } from "./provider";

type GNewsResponse = { articles?: Array<{ title: string; url: string; description?: string; publishedAt: string; source: { name: string } }> };

export class GNewsProvider implements NewsProvider {
  constructor(private readonly apiKey: string) {}

  async search(query: string): Promise<NewsResult[]> {
    const params = new URLSearchParams({ q: query, lang: "pt", country: "br", max: "10", apikey: this.apiKey });
    const response = await fetch(`https://gnews.io/api/v4/search?${params}`, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`GNews respondeu com status ${response.status}`);
    const data = (await response.json()) as GNewsResponse;
    return (data.articles ?? []).map((article) => ({
      title: article.title, url: article.url, description: article.description,
      publishedAt: article.publishedAt, source: article.source.name,
    }));
  }
}
