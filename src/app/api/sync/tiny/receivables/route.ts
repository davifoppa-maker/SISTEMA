import { ok, fail } from "@/lib/api";
import { isTinyConnected, fetchTinyReceivables } from "@/lib/services/tiny-api";
import { getSupabaseAdmin } from "@/lib/db/supabase-store";

export const maxDuration = 60;

async function fetchAll(companyId: string, situacao?: number) {
  const collected: Awaited<ReturnType<typeof fetchTinyReceivables>> = [];
  for (let offset = 0; offset < 2000; offset += 100) {
    const page = await fetchTinyReceivables({ situacao, limit: 100, offset, companyId });
    collected.push(...page);
    if (page.length < 100) break;
  }
  return collected;
}

export async function POST(req: Request) {
  const sp = new URL(req.url).searchParams;
  const companyId = sp.get("empresa") === "ecopro" ? "ecopro" : "nyer";

  if (!await isTinyConnected(companyId).catch(() => false)) {
    return fail(`Tiny (${companyId}) não conectado`, 400);
  }

  try {
    // Busca em aberto + recebidos para ter o histórico completo
    const [pending, received] = await Promise.all([
      fetchAll(companyId),      // sem filtro = pendentes/todas
      fetchAll(companyId, 2),   // situacao=2 = recebidas
    ]);

    const byId = new Map<string, (typeof pending)[0]>();
    for (const r of [...pending, ...received]) {
      if (r.tiny_id) byId.set(r.tiny_id, r);
    }

    const collected = Array.from(byId.values());
    if (collected.length === 0) return ok({ synced: 0 });

    const sb = getSupabaseAdmin();
    const rows = collected.map((r) => ({
      tiny_id: r.tiny_id,
      customer: r.customer,
      description: r.description,
      value: r.value,
      issue_date: r.issue_date ?? r.due_date,
      due_date: r.due_date,
      received_at: r.received_at,
      category: r.category,
      notes: null,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await sb
      .from("receivables")
      .upsert(rows, { onConflict: "tiny_id" });

    if (error) return fail(`Erro ao salvar: ${error.message}`, 500);

    return ok({ synced: rows.length });
  } catch (err) {
    return fail("Erro ao buscar contas a receber do Tiny", 502, err instanceof Error ? err.message : err);
  }
}
