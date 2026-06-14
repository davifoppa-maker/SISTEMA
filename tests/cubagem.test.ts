import { describe, it, expect } from "vitest";
import { calcularCubagem, cubagemParaLinhas, CAIXAS } from "@/lib/services/freight/cubagem";

describe("cubagem automática", () => {
  it("3 DrenExx (SKU 1022) cabem na Caixa 0", () => {
    const r = calcularCubagem([{ sku: "1022", descricao: "Drenexx", quantidade: 3 }]);
    expect(r.caixas).toHaveLength(1);
    expect(r.caixas[0].caixa.nome).toBe("Caixa 0");
    expect(r.caixas[0].quantidade).toBe(1);
    expect(r.semMedida).toHaveLength(0);
  });

  it("Whey pote 900g (SKU 1040) é alto (26cm) → exige Caixa 3", () => {
    const r = calcularCubagem([{ sku: "1040", descricao: "Whey pote", quantidade: 1 }]);
    expect(r.caixas).toHaveLength(1);
    // só Caixa 3 e 4 têm altura suficiente; escolhe a menor que cabe = Caixa 3
    expect(r.caixas[0].caixa.nome).toBe("Caixa 3");
  });

  it("ebook (SKU 1078, medida zerada) é ignorado e não ocupa caixa", () => {
    const r = calcularCubagem([
      { sku: "1078", descricao: "Ebook", quantidade: 1 },
      { sku: "1022", descricao: "Drenexx", quantidade: 1 },
    ]);
    expect(r.semMedida).toHaveLength(0);
    expect(r.detalheItens.find((d) => d.sku === "1078")?.status).toBe("digital");
    expect(r.caixas).toHaveLength(1); // só o DrenExx
  });

  it("SKU desconhecido vira 'sem medida' (produto novo)", () => {
    const r = calcularCubagem([{ sku: "99999", descricao: "Produto Novo X", quantidade: 2 }]);
    expect(r.semMedida).toHaveLength(1);
    expect(r.semMedida[0].sku).toBe("99999");
    expect(r.detalheItens[0].status).toBe("sem_medida");
  });

  it("pedido grande usa mais de uma caixa", () => {
    const r = calcularCubagem([{ sku: "1040", descricao: "Whey pote", quantidade: 6 }]);
    const total = r.caixas.reduce((s, c) => s + c.quantidade, 0);
    expect(total).toBeGreaterThan(1);
  });

  it("linhas de cubagem saem em metros", () => {
    const r = calcularCubagem([{ sku: "1022", descricao: "Drenexx", quantidade: 1 }]);
    const linhas = cubagemParaLinhas(r);
    expect(linhas).toHaveLength(1);
    // Caixa 0 = 18 × 14 × 7,5 cm → 0.18 × 0.14 × 0.075 m
    expect(linhas[0].comprimento).toBe("0.18");
    expect(linhas[0].altura).toBe("0.075");
    expect(linhas[0].volumes).toBe("1");
  });

  it("muitos itens pequenos consolidam em poucas caixas grandes (não vira monte de Caixa 0)", () => {
    const r = calcularCubagem([{ sku: "1022", descricao: "Drenexx", quantidade: 40 }]);
    const totalCaixas = r.caixas.reduce((s, c) => s + c.quantidade, 0);
    expect(totalCaixas).toBeLessThanOrEqual(2); // 40×504cm³ ≈ 1 caixa grande
    const caixa0 = r.caixas.find((c) => c.caixa.nome === "Caixa 0");
    expect(caixa0?.quantidade ?? 0).toBeLessThanOrEqual(1);
  });

  it("catálogo tem 5 caixas (0–4)", () => {
    expect(CAIXAS).toHaveLength(5);
  });
});
