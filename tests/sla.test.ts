import { describe, it, expect } from "vitest";
import { computeDeliveryDeadline, evaluateSla, addBusinessDays } from "@/lib/utils/sla-rules";
import { startDeliverySla } from "@/lib/services/sla";
import { buildSeedStore } from "@/lib/db/seed";
import type { Shipment } from "@/lib/types";

describe("SLA — início pela coleta real", () => {
  it("calcula a data limite a partir da coleta real, não do status Tiny", () => {
    const collectedAt = "2026-06-01T12:00:00.000Z";
    const deadline = computeDeliveryDeadline(collectedAt, 5);
    expect(deadline).toBe(addBusinessDays(collectedAt, 5));
  });

  it("startDeliverySla usa real_collected_at do shipment", () => {
    const store = buildSeedStore();
    const shipment: Shipment = {
      id: "ship-x", order_id: "ord-x", invoice_id: null, carrier_id: null, batch_id: null,
      tracking_code: null, tracking_url: null, planned_ship_date: null,
      real_collected_at: "2026-06-01T00:00:00.000Z",
      estimated_delivery_at: null, delivered_at: null, total_weight: null,
      volume_measures: null, status: "coletado",
      created_at: "", updated_at: "",
    };
    store.shipments.push(shipment);
    const record = startDeliverySla(store, shipment, 4);
    expect(record.starts_at).toBe("2026-06-01T00:00:00.000Z");
    expect(record.deadline_at).toBe(addBusinessDays("2026-06-01T00:00:00.000Z", 4));
    expect(shipment.estimated_delivery_at).toBe(record.deadline_at);
  });

  it("lança erro se não houver coleta real", () => {
    const store = buildSeedStore();
    const shipment = { ...store.shipments[0], real_collected_at: null } as Shipment;
    expect(() => startDeliverySla(store, shipment, 5)).toThrow();
  });
});

describe("evaluateSla", () => {
  const now = "2026-06-10T12:00:00.000Z";
  it("retorna concluido quando entregue", () => {
    expect(evaluateSla({ deadlineIso: "2026-06-12T00:00:00Z", deliveredAtIso: now, nowIso: now })).toBe("concluido");
  });
  it("retorna atrasado quando passou do prazo", () => {
    expect(evaluateSla({ deadlineIso: "2026-06-09T00:00:00Z", deliveredAtIso: null, nowIso: now })).toBe("atrasado");
  });
  it("retorna em_risco quando faltam menos de 24h", () => {
    expect(evaluateSla({ deadlineIso: "2026-06-11T00:00:00Z", deliveredAtIso: null, nowIso: now, riskWindowHours: 24 })).toBe("em_risco");
  });
  it("retorna no_prazo com folga", () => {
    expect(evaluateSla({ deadlineIso: "2026-06-20T00:00:00Z", deliveredAtIso: null, nowIso: now })).toBe("no_prazo");
  });
});
