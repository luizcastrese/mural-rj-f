import { NextResponse } from "next/server";
import { listNews } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export function GET() { return NextResponse.json({ items: listNews() }); }
