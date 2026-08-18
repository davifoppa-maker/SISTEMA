import { ok, fail } from "@/lib/api";
import { loadStoreFor } from "@/lib/db";
import { fetchOrderById } from "@/lib/services/tiny-api";
import type { DataStore } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Debug: mostra o valor gravado de nat_operacao + os campos crus do Tiny que
// podem conter a natureza de operacao, para achar o nome exato do campo.
//   GET /api/debug/natop?k=exxdebug&numero=352
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("k") !== "exxdebug") return fail("não autorizado", 403);
  const numero = (url.searchParams.get("numero") || "").trim();
  if (!numero) return fail("informe ?numero=", 400);

  const store = await loadStoreFor(["orders"] as Array<keyof DataStore>);
  const o = store.orders.find((x) => String(x.order_number) === numero);
  if (!o) return fail(`Pedido ${numero} não encontrado no banco`, 404);

  const empresa = (o as any).empresa ?? "nyer";
  let payload: any = null;
  let erro: string | null = null;
  let raw: any = null;
  if (o.tiny_id) {
    for (const emp of empresa === "ecopro" ? ["ecopro", "nyer"] : ["nyer", "ecopro"]) {
      try {
        payload = await fetchOrderById(o.tiny_id, emp);
        if (payload) { raw = (payload as any).raw_payload ?? null; break; }
      } catch (e) {
        erro = e instanceof Error ? e.message : String(e);
      }
    }
  }

  const camposCandidatos = raw
    ? Object.keys(raw).filter((k) => /nat|operac|marcador/i.test(k))
    : [];

  return ok({
    pedido: o.order_number,
    empresa,
    tiny_id: o.tiny_id,
    nat_operacao_gravado: (o as any).nat_operacao ?? null,
    tags_gravadas: o.tags ?? [],
    erroBuscaTiny: erro,
    payloadMapeado_nat_operacao: (payload as any)?.nat_operacao ?? null,
    payloadMapeado_marcadores: (payload as any)?.marcadores ?? null,
    camposCandidatosNoRaw: camposCandidatos,
    valoresCandidatos: camposCandidatos.reduce((acc: any, k) => { acc[k] = raw[k]; return acc; }, {}),
    rawKeys: raw ? Object.keys(raw) : [],
  });
}
