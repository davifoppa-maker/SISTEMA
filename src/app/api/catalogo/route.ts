import { ok, fail } from "@/lib/api";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/db/supabase-store";
import { getCatalog } from "@/lib/catalog";

export const dynamic = "force-dynamic";

// GET → catálogo mesclado (estático + banco).
export async function GET() {
  const produtos = await getCatalog();
  return ok({ produtos });
}

// POST → salva/atualiza os custos e preços editados. Body: array de
// { sku, name, tabela, cost, type }.
export async function POST(req: Request) {
  if (!isSupabaseConfigured()) return fail("Banco não configurado.", 503);
  let body: Array<{ sku: string; name?: string; tabela?: number; cost?: number; type?: string }>;
  try {
    body = await req.json();
  } catch {
    return fail("JSON inválido.", 400);
  }
  if (!Array.isArray(body) || body.length === 0) return fail("Envie ao menos um produto.", 400);

  const rows = body
    .filter((p) => p.sku && String(p.sku).trim())
    .map((p) => ({
      sku: String(p.sku).trim(),
      name: p.name ?? null,
      tabela: p.tabela != null ? Number(p.tabela) : null,
      cost: p.cost != null ? Number(p.cost) : null,
      type: p.type ?? null,
      updated_at: new Date().toISOString(),
    }));

  const sb = getSupabaseAdmin();
  const { error } = await sb.from("catalog_custos").upsert(rows, { onConflict: "sku" });
  if (error) return fail(`Erro ao salvar: ${error.message}`, 500);

  return ok({ salvos: rows.length });
}
