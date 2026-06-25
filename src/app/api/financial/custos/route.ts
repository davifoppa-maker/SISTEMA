import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/db/supabase-store";

export const dynamic = "force-dynamic";

export async function GET() {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.from("estoque_custos").select("nome, custo");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const map: Record<string, number> = {};
  for (const row of data ?? []) map[row.nome] = row.custo;
  return NextResponse.json(map);
}

export async function POST(req: Request) {
  const body: Record<string, number> = await req.json();
  const sb = getSupabaseAdmin();
  const rows = Object.entries(body).map(([nome, custo]) => ({
    nome,
    custo,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await sb
    .from("estoque_custos")
    .upsert(rows, { onConflict: "nome" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, saved: rows.length });
}
