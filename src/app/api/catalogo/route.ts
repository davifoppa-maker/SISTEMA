import { ok, fail } from "@/lib/api";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/db/supabase-store";
import { getCatalog } from "@/lib/catalog";
import { CATALOG } from "@/lib/product-costs";

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

// DELETE?sku=XXX → remove um produto AUTO-CADASTRADO (só existe no banco).
// Produtos padrão do sistema (hardcoded em product-costs.ts) não podem ser
// removidos por aqui — precisam de alteração no código.
export async function DELETE(req: Request) {
  if (!isSupabaseConfigured()) return fail("Banco não configurado.", 503);
  const sku = new URL(req.url).searchParams.get("sku")?.trim();
  if (!sku) return fail("Informe o SKU.", 400);

  if (CATALOG.some((p) => p.sku === sku)) {
    return fail("Este é um produto padrão do sistema — não pode ser excluído por aqui, só editado.", 400);
  }

  const sb = getSupabaseAdmin();
  const { error } = await sb.from("catalog_custos").delete().eq("sku", sku);
  if (error) return fail(`Erro ao excluir: ${error.message}`, 500);

  return ok({ excluido: sku });
}
