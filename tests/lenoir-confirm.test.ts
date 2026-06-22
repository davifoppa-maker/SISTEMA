import { describe, it, expect } from "vitest";
import { buildSeedStore } from "@/lib/db/seed";
import { runSlaAndTrackingChecks } from "@/lib/services/automation";
import type { Carrier, DataStore, Order, Shipment, SlaRecord } from "@/lib/types";

const PAST_COLLECT = "2026-06-01T12:00:00.000Z";
const PAST_DEADLINE = "2026-06-05T12:00:00.000Z";
const NOW = "2026-06-12T12:00:00.000Z"; // bem depois do prazo

function makeStore(carrierName: string, mode: Carrier["mode"], trackingTemplate: string | null): DataStore {
  const store = buildSeedStore();
  const carrier: Carrier = {
    id: "car-1", name: carrierName, mode, tracking_url_template: trackingTemplate,
    default_sla_days: 3, portal_instructions: null, active: true, created_at: "",
  };
  const order = {
    id: "ord-1", source: "tiny", source_order_id: null, tiny_id: "1", order_number: "70001",
    external_order_number: null, channel: "b2b_mercos", customer_id: "cus-1", tiny_status: null,
    logistic_status: "em_transito", total_value: 100, city: "X", state: "SC", seller: null,
    price_list: null, order_origin: null, carrier_name: carrierName, nf_numero: "1", nf_chave: null,
    freight_value: null, expected_delivery_at: PAST_DEADLINE, order_date: null, due_date: null,
    tags: [], raw_payload: null, created_at: "", updated_at: "",
  } as Order;
  const shipment: Shipment = {
    id: "ship-1", order_id: "ord-1", invoice_id: null, carrier_id: "car-1", batch_id: null,
    tracking_code: null, tracking_url: null, planned_ship_date: null,
    real_collected_at: PAST_COLLECT, estimated_delivery_at: PAST_DEADLINE, delivered_at: null,
    total_weight: null, volume_measures: null, status: "coletado", created_at: "", updated_at: "",
  };
  const sla: SlaRecord = {
    id: "sla-1", order_id: "ord-1", shipment_id: "ship-1", sla_type: "coleta_entrega",
    starts_at: PAST_COLLECT, deadline_at: PAST_DEADLINE, completed_at: null, status: "no_prazo", delay_hours: null,
  };
  store.carriers = [carrier];
  store.orders = [order];
  store.shipments = [shipment];
  store.sla_records = [sla];
  store.alerts = [];
  store.occurrences = [];
  store.customer_tasks = [];
  store.message_logs = [];
  store.customers = [{
    id: "cus-1", name: "Fulano", document: null, email: null, phone: "5599999999999",
    whatsapp_phone: "5599999999999", city: null, state: null, address: null,
    customer_type: "b2b", total_purchased: 0, last_order_at: null, created_at: "", updated_at: "",
  }];
  return store;
}

describe("SLA estourado — Lenoir (sem rastreio) pergunta ao cliente", () => {
  it("não marca 'atrasado': cria tarefa, alerta de pendência e WhatsApp na fila", () => {
    const store = makeStore("Lenoir", "manual", null);
    runSlaAndTrackingChecks(store, NOW);

    // NÃO virou atrasado.
    expect(store.orders[0].logistic_status).not.toBe("atrasado");

    // Tarefa de confirmação criada.
    expect(store.customer_tasks.some((t) => t.type === "confirmar_entrega" && t.status === "pendente")).toBe(true);
    // Alerta de pendência.
    expect(store.alerts.some((a) => a.type === "pendencia" && !a.resolved)).toBe(true);
    // WhatsApp enfileirado (fila de aprovação) com o trigger certo.
    const msg = store.message_logs.find((m) => m.trigger_key === "CONFIRMAR_ENTREGA");
    expect(msg).toBeTruthy();
    expect(msg?.status).toBe("queued");
  });

  it("respeita 1 dia de margem: não pergunta nas primeiras 24h após o prazo", () => {
    const store = makeStore("Lenoir", "manual", null);
    // 12h após o prazo (PAST_DEADLINE = 05/06 12:00) → ainda dentro da margem.
    runSlaAndTrackingChecks(store, "2026-06-06T00:00:00.000Z");
    expect(store.customer_tasks.some((t) => t.type === "confirmar_entrega")).toBe(false);
    expect(store.message_logs.some((m) => m.trigger_key === "CONFIRMAR_ENTREGA")).toBe(false);

    // 2 dias após o prazo → agora pergunta.
    runSlaAndTrackingChecks(store, "2026-06-07T12:00:00.000Z");
    expect(store.customer_tasks.some((t) => t.type === "confirmar_entrega")).toBe(true);
  });

  it("é idempotente: roda 2x e não duplica tarefa/mensagem", () => {
    const store = makeStore("Lenoir", "manual", null);
    runSlaAndTrackingChecks(store, NOW);
    runSlaAndTrackingChecks(store, NOW);
    expect(store.customer_tasks.filter((t) => t.type === "confirmar_entrega").length).toBe(1);
    expect(store.message_logs.filter((m) => m.trigger_key === "CONFIRMAR_ENTREGA").length).toBe(1);
  });
});

describe("SLA estourado — transportadora com rastreio (Jadlog) vira atrasado", () => {
  it("marca 'atrasado' e abre ocorrência de atraso", () => {
    const store = makeStore("JadLog", "api", "https://x/{code}");
    runSlaAndTrackingChecks(store, NOW);
    expect(store.orders[0].logistic_status).toBe("atrasado");
    expect(store.alerts.some((a) => a.type === "atrasado")).toBe(true);
    expect(store.occurrences.some((o) => o.type === "atraso")).toBe(true);
    // Não cria fluxo de confirmação de cliente para quem tem rastreio.
    expect(store.customer_tasks.some((t) => t.type === "confirmar_entrega")).toBe(false);
  });
});
