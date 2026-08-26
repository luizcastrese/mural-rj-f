import type { NewsResult } from "@/types/news";

export interface NewsProvider {
  search(query: string): Promise<NewsResult[]>;
}
