import { ok, fail } from "@/lib/api";
import { isTinyConnected, fetchTinyPayables } from "@/lib/services/tiny-api";
import { getSupabaseAdmin } from "@/lib/db/supabase-store";

export const maxDuration = 60;

export async function POST() {
  if (!await isTinyConnected().catch(() => false)) {
    return fail("Tiny não conectado", 400);
  }

  try {
    const collected: Awaited<ReturnType<typeof fetchTinyPayables>> = [];
    for (let offset = 0; offset < 2000; offset += 100) {
      const page = await fetchTinyPayables({ limit: 100, offset });
      collected.push(...page);
      if (page.length < 100) break;
    }

    if (collected.length === 0) return ok({ synced: 0 });

    const sb = getSupabaseAdmin();
    const rows = collected
      .filter((p) => p.tiny_id)
      .map((p) => ({
        tiny_id: p.tiny_id,
        supplier: p.supplier,
        description: p.description,
        value: p.value,
        issue_date: p.issue_date ?? p.due_date,
        due_date: p.due_date,
        paid_at: p.paid_at,
        category: p.category,
        notes: null,
      }));

    const { error } = await sb
      .from("payables")
      .upsert(rows, { onConflict: "tiny_id" });

    if (error) return fail(`Erro ao salvar: ${error.message}`, 500);

    return ok({ synced: rows.length });
  } catch (err) {
    return fail("Erro ao buscar contas a pagar do Tiny", 502, err instanceof Error ? err.message : err);
  }
}
