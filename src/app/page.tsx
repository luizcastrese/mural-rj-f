import { NewsDashboard } from "@/components/news-dashboard";
import { mockNews } from "@/data/mock-news";
import { listNews } from "@/lib/db";

export const dynamic = "force-dynamic";

export default function Home() {
  const stored = listNews();
  const items = stored.length ? stored : mockNews;
  return <div className="min-h-screen">
    <header className="bg-ink text-white">
      <div className="mx-auto flex max-w-[1280px] items-center justify-between px-5 py-6 lg:px-8">
        <div className="flex items-center gap-4"><div className="flex h-10 w-10 items-center justify-center border border-white/30 font-serif text-lg font-bold">RJ</div><div><h1 className="text-lg font-semibold tracking-[-.01em]">Radar de Insolvência</h1><p className="mt-0.5 text-[10px] uppercase tracking-[.18em] text-white/50">Clipping executivo</p></div></div>
        <div className="text-right"><p className="text-[10px] uppercase tracking-[.14em] text-white/45">Atualização</p><p className="mt-1 text-xs text-white/80">A cada 6 horas</p></div>
      </div>
      <div className="border-t border-white/10"><div className="mx-auto max-w-[1280px] px-5 py-8 lg:px-8"><p className="max-w-2xl font-serif text-2xl leading-tight tracking-[-.02em] lg:text-3xl">O essencial sobre recuperação judicial, falência e jurisprudência.</p><p className="mt-3 text-sm text-white/55">Uma leitura objetiva para começar o dia bem informado.</p></div></div>
    </header>
    <NewsDashboard items={items} />
    <footer className="border-t border-line bg-white"><div className="mx-auto flex max-w-[1280px] flex-col gap-2 px-5 py-8 text-xs text-gray-400 sm:flex-row sm:justify-between lg:px-8"><span>Radar de Insolvência</span><span>As informações não substituem a consulta às fontes originais.</span></div></footer>
  </div>;
}
