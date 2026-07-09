import { CATALOG, type Product, type ProductType } from "@/lib/product-costs";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/db/supabase-store";
import { normalizarSkus, matchStandard } from "@/lib/sku-normalize";

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

/**
 * Cadastra automaticamente na tabela `catalog_custos` qualquer produto que
 * apareça em pedidos (order_items) e AINDA não esteja no catálogo (estático + banco).
 * Entra com custo 0 (para o usuário preencher depois na aba Custos & Preços).
 * Retorna quantos produtos novos foram adicionados.
 */
export async function syncUnknownProducts(): Promise<{ adicionados: number; skus: string[] }> {
  if (!isSupabaseConfigured()) return { adicionados: 0, skus: [] };
  const sb = getSupabaseAdmin();

  // PENEIRA primeiro: SKUs divergentes que casam com um produto padrão viram o
  // SKU padrão (nos pedidos) — assim não são cadastrados como duplicata.
  try { await normalizarSkus(true); } catch { /* segue mesmo se falhar */ }

  // SKUs já conhecidos (catálogo estático + overrides do banco).
  const catalog = await getCatalog();
  const conhecidos = new Set(catalog.map((p) => p.sku));

  // Todos os itens vendidos (sku + descrição), paginado.
  const vistos = new Map<string, string>(); // sku → melhor descrição
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from("order_items")
      .select("sku, description")
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (error || !data || data.length === 0) break;
    for (const it of data as any[]) {
      const sku = (it.sku ?? "").trim();
      if (!sku || conhecidos.has(sku)) continue;
      // Se casa com um produto padrão, é divergente (será normalizado) — não cadastra.
      if (matchStandard(it.description ?? "")) continue;
      if (!vistos.has(sku) || (it.description && !vistos.get(sku))) vistos.set(sku, it.description ?? sku);
    }
    if (data.length < 1000) break;
  }

  const novos = [...vistos.entries()];
  if (novos.length === 0) return { adicionados: 0, skus: [] };

  const rows = novos.map(([sku, desc]) => ({
    sku,
    name: desc || sku,
    tabela: 0,
    cost: 0,
    // Heurística de tipo: whey/protein/hydro/beff = proteico; senão não-proteico.
    type: /whey|protein|hydro|beff|caseina|albumina/i.test(desc || "") ? "proteico" : "nao_proteico",
    updated_at: new Date().toISOString(),
  }));

  // Não sobrescreve o que já existir (ignoreDuplicates).
  const { error } = await sb.from("catalog_custos").upsert(rows, { onConflict: "sku", ignoreDuplicates: true });
  if (error) return { adicionados: 0, skus: [] };
  return { adicionados: rows.length, skus: rows.map((r) => r.sku) };
}

/**
 * @param incluirNovos quando false, retorna SÓ os produtos do catálogo PADRÃO
 * (SKUs definidos no código), aplicando os overrides de custo/preço do banco,
 * mas SEM os produtos auto-cadastrados (divergentes/zerados). Usado no Gestor
 * de Margem, que só trabalha com os SKUs padrão.
 */
export async function getCatalog(incluirNovos = true): Promise<Product[]> {
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

    // Produtos NOVOS (só no banco) entram no fim — a não ser que sejam excluídos.
    if (!incluirNovos) return merged;
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
