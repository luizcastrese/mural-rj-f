"use client";

import { useMemo, useState } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import type { NewsCategory, NewsItem } from "@/types/news";
import { NewsCard } from "./news-card";

const periods = [{ label: "Hoje", value: 1 }, { label: "Últimos 3 dias", value: 3 }, { label: "Últimos 7 dias", value: 7 }];
const categories: Array<NewsCategory | "Todas"> = ["Todas", "Recuperação Judicial", "Falência", "Jurídico"];
const sections = [
  { id: "new", title: "Novas Recuperações Judiciais", description: "Pedidos recentes e deferimentos de processamento" },
  { id: "ongoing", title: "Recuperações em andamento", description: "Planos, assembleias, financiamento e venda de ativos" },
  { id: "bankruptcy", title: "Falências", description: "Pedidos, decretações e acontecimentos relevantes" },
  { id: "legal", title: "Jurídico & Jurisprudência", description: "Tribunais, legislação e teses relevantes" },
] as const;

export function NewsDashboard({ items }: { items: NewsItem[] }) {
  const [period, setPeriod] = useState(7);
  const [category, setCategory] = useState<NewsCategory | "Todas">("Todas");
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => items.filter((item) => {
    const age = (Date.now() - new Date(item.publishedAt).getTime()) / 86_400_000;
    const term = query.trim().toLocaleLowerCase("pt-BR");
    return age < period && (category === "Todas" || item.category === category) && (!term || `${item.title} ${item.summary} ${item.company ?? ""}`.toLocaleLowerCase("pt-BR").includes(term));
  }), [items, period, category, query]);
  const highlights = [...filtered].sort((a, b) => ({ Alta: 3, Média: 2, Baixa: 1 }[b.relevance] - { Alta: 3, Média: 2, Baixa: 1 }[a.relevance])).slice(0, 6);

  return <>
    <div className="border-b border-line bg-white">
      <div className="mx-auto flex max-w-[1280px] flex-col gap-4 px-5 py-5 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div className="relative w-full lg:max-w-md"><Search className="absolute left-4 top-3.5 text-gray-400" size={18} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar empresa ou palavra-chave" aria-label="Buscar notícias" className="w-full border border-line bg-[#fafbf9] py-3 pl-11 pr-4 text-sm outline-none transition focus:border-forest" /></div>
        <div className="flex flex-wrap items-center gap-2"><SlidersHorizontal size={15} className="mr-1 text-gray-400" />{periods.map((option) => <button key={option.value} onClick={() => setPeriod(option.value)} className={`border px-3 py-2 text-xs font-medium ${period === option.value ? "border-forest bg-forest text-white" : "border-line bg-white text-gray-600 hover:border-gray-400"}`}>{option.label}</button>)}<span className="mx-1 hidden h-6 w-px bg-line sm:block" />{categories.map((option) => <button key={option} onClick={() => setCategory(option)} className={`border px-3 py-2 text-xs font-medium ${category === option ? "border-forest bg-[#e6eeea] text-forest" : "border-line bg-white text-gray-600 hover:border-gray-400"}`}>{option}</button>)}</div>
      </div>
    </div>

    <main className="mx-auto max-w-[1280px] px-5 py-10 lg:px-8 lg:py-14">
      {filtered.length === 0 ? <div className="border border-line bg-white px-6 py-16 text-center"><h2 className="text-xl font-semibold">Nenhuma notícia encontrada</h2><p className="mt-2 text-sm text-gray-500">Ajuste o período, a categoria ou o termo pesquisado.</p></div> : <>
        <section><SectionHeading eyebrow="Leitura essencial" title="Destaques do dia" description={`${highlights.length} acontecimentos selecionados por relevância`} /><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{highlights.map((item) => <NewsCard key={item.id} item={item} featured />)}</div></section>
        {sections.map((section) => { const sectionItems = filtered.filter((item) => item.section === section.id); return sectionItems.length ? <section key={section.id} className="mt-16 border-t border-line pt-10"><SectionHeading title={section.title} description={section.description} count={sectionItems.length} /><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{sectionItems.map((item) => <NewsCard key={item.id} item={item} />)}</div></section> : null; })}
      </>}
    </main>
  </>;
}

function SectionHeading({ eyebrow, title, description, count }: { eyebrow?: string; title: string; description: string; count?: number }) {
  return <div className="mb-6 flex items-end justify-between gap-4"><div>{eyebrow && <p className="mb-2 text-[11px] font-bold uppercase tracking-[.2em] text-gold">{eyebrow}</p>}<h2 className="font-serif text-2xl font-semibold tracking-[-.02em] text-ink lg:text-[28px]">{title}</h2><p className="mt-1 text-sm text-gray-500">{description}</p></div>{count !== undefined && <span className="hidden text-xs font-medium text-gray-400 sm:block">{count} {count === 1 ? "notícia" : "notícias"}</span>}</div>;
}
