import { getSupabaseAdmin } from "@/lib/db/supabase-store";

export const dynamic = "force-dynamic";

// Raio-X da tabela fiscal_notes: quantas linhas existem, como estão os campos
// data/tipo (os filtros da página dependem deles) e uma amostra crua.
//   GET /api/debug/fiscal-notes?k=exxdebug
export async function GET(req: Request) {
  const u = new URL(req.url);
  if (u.searchParams.get("k") !== "exxdebug") {
    return Response.json({ ok: false, error: "não autorizado" }, { status: 403 });
  }
  const sb = getSupabaseAdmin();
  const { count: total } = await sb.from("fiscal_notes").select("*", { count: "exact", head: true });
  const { count: semData } = await sb.from("fiscal_notes").select("*", { count: "exact", head: true }).is("data", null);
  const { data: amostra, error } = await sb
    .from("fiscal_notes")
    .select("id, empresa, tipo, numero, data, valor, vicms, situacao")
    .limit(8);
  const { data: tipos } = await sb.from("fiscal_notes").select("tipo");
  const porTipo: Record<string, number> = {};
  for (const t of tipos ?? []) porTipo[(t as any).tipo ?? "null"] = (porTipo[(t as any).tipo ?? "null"] ?? 0) + 1;
  return Response.json({ ok: true, total, semData, porTipo, amostra, erro: error?.message ?? null });
}
