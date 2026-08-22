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
  // &xml=1 → baixa o XML da 1ª nota da amostra e mostra o começo CRU (para
  // decifrar o formato real que o parser precisa tratar).
  let xmlCru: Record<string, unknown> | null = null;
  if (u.searchParams.get("xml") === "1" && (amostra ?? []).length > 0) {
    const { getTinyConfig, tinyFetch } = await import("@/lib/services/tiny-api");
    const alvo = (amostra as any[])[0];
    const tinyId = String(alvo.id).split(":")[1];
    const empresa = alvo.empresa ?? "nyer";
    const c = getTinyConfig(empresa);
    try {
      const r = await tinyFetch(`${c.apiBaseUrl}/notas/${tinyId}/xml`, {}, empresa);
      const bruto = await r.text();
      xmlCru = {
        notaId: tinyId,
        status: r.status,
        contentType: r.headers.get("content-type"),
        tamanho: bruto.length,
        inicio: bruto.slice(0, 600),
      };
    } catch (e) {
      xmlCru = { erro: e instanceof Error ? e.message : "erro" };
    }
  }

  return Response.json({ ok: true, total, semData, porTipo, amostra, xmlCru, erro: error?.message ?? null });
}
