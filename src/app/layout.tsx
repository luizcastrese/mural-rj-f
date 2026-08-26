import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Radar RJ — Clipping executivo",
  description: "Notícias sobre recuperação judicial, falência e jurisprudência.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
