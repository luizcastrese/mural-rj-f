import { updateNews } from "../src/lib/news/update";

updateNews().then((count) => console.log(`${count} notícias importadas.`)).catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
