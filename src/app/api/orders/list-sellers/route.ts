import { getSupabaseAdmin } from "@/lib/db/supabase-store";
import { ok, fail } from "@/lib/api";

export async function GET() {
  try {
    const sb = getSupabaseAdmin();
    // Puxar todos os vendedores dos pedidos (do Olist)
    const { data, error } = await sb
      .from("orders")
      .select("seller");

    if (error) return fail("Erro ao buscar vendedores", 500, error);

    // Deduplica e ordena
    const sellersSet = new Set<string>();
    (data ?? []).forEach((row: any) => {
      if (row.seller && row.seller.trim()) {
        sellersSet.add(row.seller.trim());
      }
    });

    const sellers = Array.from(sellersSet)
      .sort()
      .map((name) => ({
        id: name,
        name: name,
      }));

    return ok({ sellers });
  } catch (err) {
    return fail("Erro ao listar vendedores", 500, err instanceof Error ? err.message : err);
  }
}
