import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { buildSeedStore } from "@/lib/db/seed";
import { pollCarrierTracking } from "@/lib/services/freight/tracking-poll";
import type { Carrier, DataStore, Order, Shipment } from "@/lib/types";

// Monta um store mínimo com 1 pedido Jadlog coletado e ainda não entregue.
function makeStore(): DataStore {
  const store = buildSeedStore();
  const carrier: Carrier = {
    id: "car-jad", name: "JadLog", mode: "api", tracking_url_template: "https://x/{code}",
    default_sla_days: 5, portal_instructions: null, active: true, created_at: "",
  };
  const order = {
    id: "ord-1", source: "tiny", source_order_id: null, tiny_id: "1", order_number: "71955",
    external_order_number: null, channel: "b2b_mercos", customer_id: "cus-1", tiny_status: null,
    logistic_status: "coletado", total_value: 100, city: "Urubici", state: "SC", seller: null,
    price_list: null, order_origin: null, carrier_name: "JadLog", nf_numero: "253926", nf_chave: null,
    freight_value: null, expected_delivery_at: null, order_date: null, due_date: null,
    tags: [], raw_payload: null, created_at: "", updated_at: "",
  } as Order;
  const shipment: Shipment = {
    id: "ship-1", order_id: "ord-1", invoice_id: null, carrier_id: "car-jad", batch_id: null,
    tracking_code: "12396600024828", tracking_url: null, planned_ship_date: null,
    real_collected_at: "2026-06-09T17:00:00.000Z", estimated_delivery_at: null, delivered_at: null,
    total_weight: null, volume_measures: null, status: "coletado", created_at: "", updated_at: "",
  };
  store.carriers = [carrier];
  store.orders = [order];
  store.shipments = [shipment];
  store.alerts = [];
  store.carrier_tracking_events = [];
  return store;
}

beforeEach(() => {
  process.env.JADLOG_TOKEN = "token-teste";
  process.env.JADLOG_CNPJ = "33042107000151";
});
afterEach(() => vi.restoreAllMocks());

function mockJadlog(body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } })),
  );
}

describe("pollCarrierTracking — baixa automática + notificação", () => {
  it("entrega confirmada baixa para 'entregue' (data real) e cria notificação", async () => {
    const store = makeStore();
    mockJadlog({
      consulta: [{
        shipmentId: "12396600024828",
        tracking: { status: "ENTREGUE", eventos: [
          { data: "2026-06-14 10:00:00", status: "SAIDA PARA ENTREGA", unidade: "X" },
          { data: "2026-06-15 14:32:00", status: "ENTREGUE", unidade: "URUBICI" },
        ] },
      }],
    });

    const res = await pollCarrierTracking(store);
    expect(res.deliveriesAuto).toBe(1);

    // Baixa automática: pedido e expedição entregues, com a data REAL.
    expect(store.orders[0].logistic_status).toBe("entregue");
    expect(store.shipments[0].status).toBe("entregue");
    expect(store.shipments[0].delivered_at).toBe("2026-06-15T14:32:00");

    // Notificação criada e aberta (até o operador visualizar).
    const notif = store.alerts.find((a) => a.type === "entrega_confirmada" && a.shipment_id === "ship-1");
    expect(notif).toBeTruthy();
    expect(notif?.resolved).toBe(false);
    expect(notif?.message).toContain("entregue pela JadLog");

    // Registrou eventos no histórico.
    expect(store.carrier_tracking_events.length).toBeGreaterThan(0);
  });

  it("não reconsulta um pedido já entregue (idempotente)", async () => {
    const store = makeStore();
    mockJadlog({
      consulta: [{ shipmentId: "12396600024828", tracking: { status: "ENTREGUE", eventos: [{ data: "2026-06-15 14:32:00", status: "ENTREGUE", unidade: "U" }] } }],
    });
    await pollCarrierTracking(store);
    const res2 = await pollCarrierTracking(store);
    expect(res2.checked).toBe(0); // pulou: já tem delivered_at
    expect(store.alerts.filter((a) => a.type === "entrega_confirmada").length).toBe(1);
  });

  it("em trânsito (sem entrega) avança 'coletado' → 'em_transito' e grava previsão", async () => {
    const store = makeStore();
    mockJadlog({
      consulta: [{
        shipmentId: "12396600024828",
        previsaoEntrega: "2026-06-30",
        tracking: { status: "TRANSFERIDO PARA UNIDADE", eventos: [{ data: "2026-06-14 10:00:00", status: "TRANSFERENCIA", unidade: "X" }] },
      }],
    });
    const res = await pollCarrierTracking(store);
    expect(res.deliveriesAuto).toBe(0);
    expect(store.orders[0].logistic_status).toBe("em_transito");
    expect(store.shipments[0].estimated_delivery_at).toBe("2026-06-30");
    expect(store.alerts.some((a) => a.type === "entrega_confirmada")).toBe(false);
  });
});
