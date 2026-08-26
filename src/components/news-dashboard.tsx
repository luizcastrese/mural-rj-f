import type { NewsItem } from "@/types/news";
import { NewsCard } from "./news-card";

const sections = [
  { id: "new", title: "Novas Recuperações Judiciais", description: "Pedidos recentes e deferimentos de processamento" },
  { id: "ongoing", title: "Recuperações em andamento", description: "Planos, assembleias, financiamento e venda de ativos" },
  { id: "bankruptcy", title: "Falências", description: "Pedidos, decretações e acontecimentos relevantes" },
  { id: "legal", title: "Jurídico & Jurisprudência", description: "Tribunais, legislação e teses relevantes" },
] as const;

const relevanceWeight = { Alta: 3, Média: 2, Baixa: 1 };

export function NewsDashboard({ items }: { items: NewsItem[] }) {
  const recentItems = items
    .filter((item) => Date.now() - new Date(item.publishedAt).getTime() < 7 * 86_400_000)
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));

  const highlights = [...recentItems]
    .sort((a, b) => relevanceWeight[b.relevance] - relevanceWeight[a.relevance] || Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .slice(0, 6);

  if (recentItems.length === 0) {
    return (
      <main className="mx-auto max-w-[1280px] px-5 py-10 lg:px-8 lg:py-14">
        <div className="border border-line bg-white px-6 py-16 text-center">
          <h2 className="text-xl font-semibold">Nenhuma notícia recente</h2>
          <p className="mt-2 text-sm text-gray-500">Novas informações serão exibidas automaticamente na próxima atualização.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[1280px] px-5 py-10 lg:px-8 lg:py-14">
      <section>
        <SectionHeading eyebrow="Leitura essencial" title="Destaques do dia" description={`${highlights.length} acontecimentos recentes selecionados por relevância`} />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {highlights.map((item) => <NewsCard key={item.id} item={item} featured />)}
        </div>
      </section>

      {sections.map((section) => {
        const sectionItems = recentItems.filter((item) => item.section === section.id);
        if (sectionItems.length === 0) return null;
        return (
          <section key={section.id} className="mt-16 border-t border-line pt-10">
            <SectionHeading title={section.title} description={section.description} count={sectionItems.length} />
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {sectionItems.map((item) => <NewsCard key={item.id} item={item} />)}
            </div>
          </section>
        );
      })}
    </main>
  );
}

function SectionHeading({ eyebrow, title, description, count }: { eyebrow?: string; title: string; description: string; count?: number }) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="mb-2 text-[11px] font-bold uppercase tracking-[.2em] text-gold">{eyebrow}</p>}
        <h2 className="font-serif text-2xl font-semibold tracking-[-.02em] text-ink lg:text-[28px]">{title}</h2>
        <p className="mt-1 text-sm text-gray-500">{description}</p>
      </div>
      {count !== undefined && <span className="hidden text-xs font-medium text-gray-400 sm:block">{count} {count === 1 ? "notícia" : "notícias"}</span>}
    </div>
  );
}
