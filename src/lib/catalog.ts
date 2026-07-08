import { CATALOG, type Product, type ProductType } from "@/lib/product-costs";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/db/supabase-store";

// Catálogo do Gestor de Margem = catálogo estático (código) MESCLADO com os
// ajustes salvos no banco (tabela `catalog_custos`). Assim os custos/preços
// podem ser editados pela tela de administração sem mexer no código.
//
// Tabela esperada no Supabase:
//   create table if not exists catalog_custos (
//     sku text primary key,
//     name text,
//     tabela numeric,
//     cost numeric,
//     type text,
//     updated_at timestamptz not null default now()
//   );

export async function getCatalog(): Promise<Product[]> {
  if (!isSupabaseConfigured()) return CATALOG;

  try {
    const sb = getSupabaseAdmin();
    const { data, error } = await sb.from("catalog_custos").select("sku,name,tabela,cost,type");
    if (error || !data) return CATALOG;

    const overrides = new Map<string, { name?: string; tabela?: number; cost?: number; type?: string }>();
    for (const r of data as any[]) overrides.set(String(r.sku), r);

    // Aplica overrides nos produtos existentes.
    const merged: Product[] = CATALOG.map((p) => {
      const o = overrides.get(p.sku);
      if (!o) return p;
      overrides.delete(p.sku);
      return {
        ...p,
        name: o.name ?? p.name,
        tabela: o.tabela != null ? Number(o.tabela) : p.tabela,
        cost: o.cost != null ? Number(o.cost) : p.cost,
        type: (o.type as ProductType) ?? p.type,
      };
    });

    // Produtos NOVOS (só no banco) entram no fim.
    for (const [sku, o] of overrides) {
      merged.push({
        sku,
        name: o.name ?? sku,
        tabela: Number(o.tabela ?? 0),
        cost: Number(o.cost ?? 0),
        type: (o.type as ProductType) ?? "proteico",
      });
    }
    return merged;
  } catch {
    return CATALOG;
  }
}
