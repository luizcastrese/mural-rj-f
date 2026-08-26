import { ArrowUpRight } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { NewsItem } from "@/types/news";

const relevanceStyle = { Alta: "bg-[#f3e9d8] text-[#7a551c]", Média: "bg-[#e6eeea] text-forest", Baixa: "bg-gray-100 text-gray-500" };

export function NewsCard({ item, featured = false }: { item: NewsItem; featured?: boolean }) {
  return (
    <article className={`group flex h-full flex-col border border-line bg-white shadow-card transition hover:border-[#b8c5bd] ${featured ? "p-6" : "p-5"}`}>
      <div className="mb-4 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.12em] text-gray-500">
        <span className="text-forest">{item.category}</span><span>•</span>
        <span className={`rounded-sm px-2 py-1 ${relevanceStyle[item.relevance]}`}>{item.relevance}</span>
      </div>
      <h3 className={`${featured ? "text-[20px]" : "text-[17px]"} font-semibold leading-[1.35] tracking-[-.015em] text-ink group-hover:text-forest`}>{item.title}</h3>
      <p className="mt-3 line-clamp-4 text-sm leading-6 text-[#58615d]">{item.summary}</p>
      <div className="mt-auto flex items-end justify-between gap-4 pt-6">
        <div className="text-xs leading-5 text-gray-500"><strong className="block font-medium text-[#38423e]">{item.source}</strong>{format(new Date(item.publishedAt), "dd 'de' MMMM, HH:mm", { locale: ptBR })}</div>
        <a href={item.url} target="_blank" rel="noreferrer" aria-label={`Abrir notícia: ${item.title}`} className="flex shrink-0 items-center gap-1 text-xs font-semibold text-forest hover:underline">Ler original <ArrowUpRight size={14} /></a>
      </div>
    </article>
  );
}
