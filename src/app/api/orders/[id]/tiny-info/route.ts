import { ok, fail } from "@/lib/api";
import { getSupabaseAdmin } from "@/lib/db/supabase-store";
import { fetchOrderWeight, isTinyConfigured } from "@/lib/services/tiny-api";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Peso/CEP/volumes do pedido no Tiny — chamado em SEGUNDO PLANO pela tela de
// cotação (antes esta busca BLOQUEAVA a página inteira; Tiny lento = 1 min de
// tela branca).
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const sb = getSupabaseAdmin();
  const { data: order } = await sb.from("orders").select("*").eq("id", params.id).maybeSingle();
  if (!order?.tiny_id || !isTinyConfigured()) return fail("Pedido sem Tiny vinculado.", 404);
  try {
    const w = await fetchOrderWeight(order.tiny_id, { companyId: (order as Record<string, unknown>).empresa as string ?? "nyer" });
    return ok(w);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "erro", 502);
  }
}
