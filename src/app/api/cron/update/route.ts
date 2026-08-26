import { NextRequest, NextResponse } from "next/server";
import { updateNews } from "@/lib/news/update";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  try {
    const imported = await updateNews();
    return NextResponse.json({ ok: true, imported, updatedAt: new Date().toISOString() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha na atualização" }, { status: 500 });
  }
}
