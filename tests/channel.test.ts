import { describe, it, expect } from "vitest";
import { detectChannel } from "@/lib/services/channel";
import { buildSeedStore } from "@/lib/db/seed";

const rules = buildSeedStore().channel_detection_rules;

describe("detectChannel", () => {
  it("classifica pedido com origem Mercos como B2B", () => {
    const payload = { ecommerce: { nome: "Mercos" }, marcadores: [{ descricao: "Atacado/Mercos" }] };
    const { channel } = detectChannel(payload, rules);
    expect(channel).toBe("b2b_mercos");
  });

  it("classifica pedido com origem Nuvemshop como B2C", () => {
    const payload = { ecommerce: { nome: "Nuvemshop Exx" }, marcadores: [{ descricao: "Varejo/Nuvemshop" }] };
    const { channel } = detectChannel(payload, rules);
    expect(channel).toBe("b2c_nuvemshop");
  });

  it("retorna indefinido quando nenhuma regra casa", () => {
    const payload = { ecommerce: { nome: "Loja Desconhecida" } };
    const { channel } = detectChannel(payload, rules);
    expect(channel).toBe("indefinido");
  });

  it("respeita a prioridade das regras", () => {
    const ordered = [
      { id: "a", name: "low prio b2c", source: "tiny", json_path: "x", operator: "exists" as const, expected_value: null, result_channel: "b2c_nuvemshop" as const, priority: 100, active: true },
      { id: "b", name: "high prio b2b", source: "tiny", json_path: "x", operator: "exists" as const, expected_value: null, result_channel: "b2b_mercos" as const, priority: 1, active: true },
    ];
    const { channel } = detectChannel({ x: "qualquer" }, ordered);
    expect(channel).toBe("b2b_mercos");
  });
});
