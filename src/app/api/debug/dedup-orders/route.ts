import { ok, fail } from "@/lib/api";
import { getSupabaseAdmin } from "@/lib/db/supabase-store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Remove pedidos DUPLICADOS direto no banco, em lotes (leve, não carrega a base
// inteira). Identidade: tiny_id + empresa. Mantém o mais antigo de cada grupo.
// ?dry=1 só conta; sem dry, apaga até `max` pedidos por execução (rode de novo
// para continuar).
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("k") !== "exxdebug") return fail("não autorizado", 403);
  const dry = url.searchParams.get("dry") === "1";
  const max = Math.min(Number(url.searchParams.get("max") ?? "300"), 500);

  const sb = getSupabaseAdmin();

  // Lê só o necessário para achar duplicados.
  const { data: orders, error } = await sb
    .from("orders")
    .select("id,tiny_id,order_number,empresa,created_at")
    .order("created_at", { ascending: true });
  if (error) return fail(`Erro lendo orders: ${error.message}`, 500);

  const grupos = new Map<string, string[]>();
  for (const o of orders ?? []) {
    const emp = (o as any).empresa ?? "nyer";
    const key = (o as any).tiny_id ? `t:${(o as any).tiny_id}:${emp}` : `n:${(o as any).order_number}:${emp}`;
    const arr = grupos.get(key) ?? [];
    arr.push((o as any).id); // já vem ordenado por created_at asc → [0] é o mais antigo
    grupos.set(key, arr);
  }

  // IDs a remover: todos menos o 1º (mais antigo) de cada grupo com >1.
  const removerIds: string[] = [];
  for (const ids of grupos.values()) if (ids.length > 1) removerIds.push(...ids.slice(1));

  if (dry) {
    return ok({ dry: true, total: orders?.length ?? 0, duplicados: removerIds.length, grupos_com_dup: [...grupos.values()].filter((a) => a.length > 1).length });
  }

  const lote = removerIds.slice(0, max);
  if (lote.length === 0) return ok({ removidos: 0, restantes: 0, done: true });

  // Apaga filhos antes dos pedidos (evita violação de FK). Ignora tabela ausente.
  const delChildren = async (table: string, col: string) => {
    const { error } = await sb.from(table).delete().in(col, lote);
    if (error && !/does not exist|relation|column/i.test(error.message)) {
      throw new Error(`Erro apagando ${table}: ${error.message}`);
    }
  };

  try {
    // shipment_volumes referencia shipments; apaga volumes dos shipments desses pedidos.
    const { data: ships } = await sb.from("shipments").select("id").in("order_id", lote);
    const shipIds = (ships ?? []).map((s: any) => s.id);
    if (shipIds.length > 0) {
      await sb.from("shipment_volumes").delete().in("shipment_id", shipIds);
    }
    await delChildren("shipments", "order_id");
    await delChildren("invoices", "order_id");
    await delChildren("order_items", "order_id");
    await delChildren("sla_records", "order_id");
    await delChildren("audit_logs", "order_id");
    const { error: delErr } = await sb.from("orders").delete().in("id", lote);
    if (delErr) return fail(`Erro apagando orders: ${delErr.message}`, 500);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "erro na limpeza", 500);
  }

  const restantes = removerIds.length - lote.length;
  return ok({ removidos: lote.length, restantes, done: restantes === 0 });
}
