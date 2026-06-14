import { loadStore } from "@/lib/db";
import { ok, fail } from "@/lib/api";
import { tinyFetch, getTinyConfig, isTinyConnected } from "@/lib/services/tiny-api";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Diagnóstico SÓ-LEITURA: mostra o que o detalhe do pedido no Tiny devolve dos
// itens. Protegido por chave simples (?k=) para poder rodar direto na produção.
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("k") !== "exxdebug") return fail("não autorizado", 403);
  if (!(await isTinyConnected().catch(() => false))) return fail("Tiny não conectado", 400);

  const numero = url.searchParams.get("numero");
  let tinyId = url.searchParams.get("tinyId") ?? undefined;

  if (!tinyId && numero) {
    const store = await loadStore();
    const order = store.orders.find((o) => o.order_number === numero);
    if (!order) return fail(`Pedido nº ${numero} não encontrado na base.`, 404);
    tinyId = order.tiny_id ?? undefined;
    if (!tinyId) return fail(`Pedido nº ${numero} sem tiny_id.`, 404);
  }
  if (!tinyId) return fail("Informe ?numero= ou ?tinyId=", 422);

  const c = getTinyConfig();
  const res = await tinyFetch(`${c.apiBaseUrl}/pedidos/${encodeURIComponent(tinyId)}`);
  const status = res.status;
  if (!res.ok) {
    return ok({ tinyId, status, body: (await res.text()).slice(0, 400) });
  }
  let raw: any = await res.json();
  const rawType = typeof raw;
  const rawSample = typeof raw === "string" ? raw.slice(0, 300) : undefined;
  // Alguns retornos vêm como STRING com JSON dentro (corpo duplo-encodado).
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      /* mantém string */
    }
  }
  // Desembrulha só se for objeto (o campo `data` é a data do pedido, uma string).
  const isObj = (v: unknown) => Boolean(v) && typeof v === "object" && !Array.isArray(v);
  const ped = isObj(raw?.pedido) ? raw.pedido : isObj(raw?.data) ? raw.data : raw;
  const itensRaw = Array.isArray(ped?.itens) ? ped.itens : Array.isArray(ped?.items) ? ped.items : [];

  return ok({
    tinyId,
    status,
    rawType,
    rawSample,
    pedidoKeys: ped && typeof ped === "object" ? Object.keys(ped) : [],
    situacao: ped?.situacao ?? ped?.codigoSituacao ?? null,
    idNotaFiscal: ped?.idNotaFiscal ?? null,
    itensCampo: Array.isArray(ped?.itens) ? "itens" : Array.isArray(ped?.items) ? "items" : "(nenhum)",
    itensLen: itensRaw.length,
    // primeiros 3 itens CRUS, pra vermos os nomes exatos dos campos (sku/codigo/produto)
    itensAmostra: itensRaw.slice(0, 3),
  });
}
