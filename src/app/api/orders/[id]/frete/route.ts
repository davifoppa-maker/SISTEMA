import { loadStore, commitStore } from "@/lib/db";
import { ok, fail } from "@/lib/api";
import { resolveOrCreateCarrier } from "@/lib/services/tiny";
import { gravarTransporteNoTiny, isTinyConfigured } from "@/lib/services/tiny-api";
import { nowIso, uuid } from "@/lib/utils/ids";

export const maxDuration = 30;

/**
 * Registra no pedido a transportadora escolhida na cotação + o valor do frete
 * (e o prazo, no log). Grava SOMENTE no nosso sistema (Pós-Venda Exx). Se houver
 * expedição (shipment) ainda não coletada, vincula a transportadora a ela para
 * aparecer no pedido.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  let body: {
    transportadora?: string;
    valor?: number | string;
    prazo?: number | string;
    provider?: string;
    volumes?: number | string;
  };
  try {
    body = await req.json();
  } catch {
    return fail("JSON inválido", 400);
  }

  const transportadora = String(body.transportadora ?? "").trim();
  if (!transportadora) return fail("Informe a transportadora.", 422);
  const valor = Number(String(body.valor ?? "").replace(",", ".")) || 0;
  const prazo = body.prazo != null && body.prazo !== "" ? Number(body.prazo) : null;

  const store = await loadStore();
  const order = store.orders.find((o) => o.id === params.id);
  if (!order) return fail("Pedido não encontrado", 404);

  const previousCarrier = order.carrier_name;
  order.carrier_name = transportadora;
  order.freight_value = valor;
  order.updated_at = nowIso();

  // Vincula a transportadora à expedição (se houver e ainda não coletada) para
  // refletir no card "Nota fiscal & expedição" do pedido.
  const shipment = store.shipments.find((s) => s.order_id === order.id);
  if (shipment && !shipment.real_collected_at) {
    const carrierId = resolveOrCreateCarrier(store, transportadora);
    if (carrierId) {
      shipment.carrier_id = carrierId;
      shipment.updated_at = nowIso();
    }
  }

  store.audit_logs.push({
    id: uuid(),
    entity: "order",
    entity_id: order.id,
    action: "registrar_frete",
    detail: `transportadora=${transportadora}${body.provider ? ` (${body.provider})` : ""} frete=R$ ${valor.toFixed(2)}${prazo != null ? ` prazo=${prazo}d` : ""}${previousCarrier ? ` (antes: ${previousCarrier})` : ""}`,
    user_id: null,
    created_at: nowIso(),
  });

  await commitStore(store);

  // Também grava a transportadora no pedido do Tiny: mapeia a transportadora
  // escolhida para a forma de envio cadastrada e seta via PUT /pedidos/{id}.
  // A resposta volta para a tela (sucesso, sem match, ou erro do Tiny).
  let tiny: {
    attempted: boolean;
    ok?: boolean;
    status?: number;
    body?: string;
    formaEnvioNome?: string | null;
    idFormaEnvio?: number | null;
    formasDisponiveis?: string[];
    transporteStatus?: number;
    transporteBody?: string;
    transporte?: unknown;
    pedidoKeys?: string[];
    pedidoRaw?: string;
    getStatus?: number;
  } = { attempted: false };
  if (order.tiny_id && isTinyConfigured()) {
    try {
      const r = await gravarTransporteNoTiny(order.tiny_id, transportadora, {
        provider: body.provider,
        volumes: body.volumes != null && body.volumes !== "" ? Number(body.volumes) : undefined,
        frete: valor,
        prazoDias: prazo ?? undefined,
      });
      tiny = { attempted: true, ...r };
    } catch (err) {
      tiny = { attempted: true, ok: false, body: (err as Error).message };
    }
  }

  return ok({ order_id: order.id, transportadora, freight_value: valor, prazo, tiny });
}
