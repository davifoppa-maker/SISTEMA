import { describe, it, expect } from "vitest";
import { quoteLenoir, trackLenoir, isLenoirConfigured } from "@/lib/services/freight/lenoir";
import { lenoirFaixaForCep } from "@/lib/services/freight/data/lenoir-tabela";
import { getProvider } from "@/lib/services/freight/registry";

const baseParams = {
  cnpjDestinatario: "1",
  vlrMercadoria: 100,
  peso: 50, // peso alto de propósito: Lenoir ignora limite de peso
  volumes: 1,
  cubagem: [{ altura: 0.4, largura: 0.4, comprimento: 0.4, volumes: 1 }],
};

describe("tabela Lenoir (por CEP)", () => {
  it("Braço do Norte: R$ 20, prazo 2", () => {
    const f = lenoirFaixaForCep("88750000");
    expect(f?.valor).toBe(20);
    expect(f?.prazo).toBe(2);
  });
  it("Araranguá Balneário Ilhas: prazo 6", () => {
    expect(lenoirFaixaForCep("88912520")?.prazo).toBe(6);
  });
  it("CEP fora da área de atendimento → null", () => {
    expect(lenoirFaixaForCep("01001000")).toBeNull(); // São Paulo
  });
});

describe("cotação Lenoir", () => {
  it("cota CEP atendido pelo valor fixo (ignora peso alto)", async () => {
    const out = await quoteLenoir({ ...baseParams, cepDestino: "88801000" }); // Criciúma
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.data.totalFrete).toBe(20);
      expect(out.data.prazo).toBe(3);
    }
  });
  it("recusa CEP não atendido", async () => {
    const out = await quoteLenoir({ ...baseParams, cepDestino: "20040000" }); // RJ
    expect(out.ok).toBe(false);
  });
  it("não tem rastreio", async () => {
    expect((await trackLenoir()).ok).toBe(false);
  });
});

describe("registro", () => {
  it("Lenoir registrada e sempre configurada", () => {
    expect(getProvider("lenoir")?.label).toBe("Lenoir");
    expect(isLenoirConfigured()).toBe(true);
  });
});
