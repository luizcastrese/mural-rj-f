import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import type { NewsItem } from "@/types/news";

// Vercel Functions only allow runtime writes in /tmp. This keeps the public
// preview operational; use a persistent database for production storage.
const configuredDbPath = process.env.VERCEL ? "/tmp/news.db" : (process.env.DATABASE_PATH ?? "./data/news.db");
const dbPath = path.resolve(configuredDbPath);
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const globalForDb = globalThis as unknown as { newsDb?: DatabaseSync };
export const db = globalForDb.newsDb ?? new DatabaseSync(dbPath);
if (process.env.NODE_ENV !== "production") globalForDb.newsDb = db;

db.exec("PRAGMA journal_mode = WAL");
db.exec(`CREATE TABLE IF NOT EXISTS news_items (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, url TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL, published_at TEXT NOT NULL, category TEXT NOT NULL,
  section TEXT NOT NULL, summary TEXT NOT NULL, relevance TEXT NOT NULL,
  company TEXT, created_at TEXT NOT NULL
)`);

export function listNews(): NewsItem[] {
  const rows = db.prepare("SELECT * FROM news_items ORDER BY published_at DESC").all() as Record<string, string | null>[];
  return rows.map((row) => ({
    id: row.id!, title: row.title!, url: row.url!, source: row.source!,
    publishedAt: row.published_at!, category: row.category as NewsItem["category"],
    section: row.section as NewsItem["section"], summary: row.summary!,
    relevance: row.relevance as NewsItem["relevance"], company: row.company ?? undefined,
    createdAt: row.created_at!,
  }));
}

export function saveNews(items: NewsItem[]) {
  const insert = db.prepare(`INSERT OR IGNORE INTO news_items
    (id,title,url,source,published_at,category,section,summary,relevance,company,created_at)
    VALUES (@id,@title,@url,@source,@publishedAt,@category,@section,@summary,@relevance,@company,@createdAt)`);
  db.exec("BEGIN");
  try {
    items.forEach((item) => insert.run({ ...item, company: item.company ?? null }));
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
