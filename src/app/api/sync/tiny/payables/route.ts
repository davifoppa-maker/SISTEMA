import { ok, fail } from "@/lib/api";
import { isTinyConnected, fetchTinyPayables } from "@/lib/services/tiny-api";
import { getSupabaseAdmin } from "@/lib/db/supabase-store";

export const maxDuration = 60;

export async function POST(req: Request) {
  if (!await isTinyConnected().catch(() => false)) {
    return fail("Tiny não conectado", 400);
  }

  const sp = new URL(req.url).searchParams;
  const dataInicial = sp.get("inicio") || undefined;
  const dataFinal = sp.get("fim") || undefined;

  try {
    const collected: Awaited<ReturnType<typeof fetchTinyPayables>> = [];
    for (let offset = 0; offset < 500; offset += 100) {
      const page = await fetchTinyPayables({ dataInicial, dataFinal, limit: 100, offset });
      collected.push(...page);
      if (page.length < 100) break;
    }

    if (collected.length === 0) return ok({ synced: 0 });

    const sb = getSupabaseAdmin();
    const rows = collected.map((p) => ({
      supplier: p.supplier,
      description: p.description,
      value: p.value,
      issue_date: p.issue_date ?? p.due_date,
      due_date: p.due_date,
      paid_at: p.paid_at,
      category: p.category,
      notes: p.tiny_id ? `tiny_id:${p.tiny_id}` : null,
    }));

    // Upsert por tiny_id (guardado em notes) — evita duplicatas.
    // Como não temos coluna tiny_id na tabela, inserimos apenas novos.
    const { error } = await sb.from("payables").insert(rows);
    if (error) return fail(`Erro ao salvar: ${error.message}`, 500);

    return ok({ synced: collected.length });
  } catch (err) {
    return fail("Erro ao buscar contas a pagar do Tiny", 502, err instanceof Error ? err.message : err);
  }
}
