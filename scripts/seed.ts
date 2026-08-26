import { mockNews } from "../src/data/mock-news";
import { saveNews } from "../src/lib/db";

saveNews(mockNews);
console.log(`${mockNews.length} notícias de demonstração gravadas.`);
