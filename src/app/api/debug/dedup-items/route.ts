import { ok, fail } from "@/lib/api";
import { getSupabaseAdmin } from "@/lib/db/supabase-store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Remove ITENS de pedido duplicados. Um item é duplicado quando existe outro no
// MESMO pedido com o mesmo sku + descrição + quantidade. Mantém 1, apaga os
// demais. ?dry=1 só conta.
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("k") !== "exxdebug") return fail("não autorizado", 403);
  const dry = url.searchParams.get("dry") === "1";
  const max = Math.min(Number(url.searchParams.get("max") ?? "500"), 1000);

  const sb = getSupabaseAdmin();
  const { data: items, error } = await sb
    .from("order_items")
    .select("id,order_id,sku,description,quantity,unit_value")
    .order("id", { ascending: true });
  if (error) return fail(`Erro lendo order_items: ${error.message}`, 500);

  const visto = new Set<string>();
  const removerIds: string[] = [];
  for (const it of items ?? []) {
    const k = `${(it as any).order_id}|${(it as any).sku}|${(it as any).description}|${(it as any).quantity}|${(it as any).unit_value}`;
    if (visto.has(k)) removerIds.push((it as any).id);
    else visto.add(k);
  }

  if (dry) return ok({ dry: true, total: items?.length ?? 0, duplicados: removerIds.length });

  const lote = removerIds.slice(0, max);
  if (lote.length === 0) return ok({ removidos: 0, restantes: 0, done: true });
  const { error: delErr } = await sb.from("order_items").delete().in("id", lote);
  if (delErr) return fail(`Erro apagando: ${delErr.message}`, 500);

  return ok({ removidos: lote.length, restantes: removerIds.length - lote.length, done: removerIds.length - lote.length === 0 });
}
