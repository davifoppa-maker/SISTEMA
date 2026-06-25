import { describe, it, expect, afterEach, vi } from "vitest";
import { getEstoqueReport, EstoqueIndisponivelError } from "@/lib/services/estoque";

// CSV que imita o export do Google Sheets para cada aba da planilha BALANCO ESTOQUE.
const MATERIA_CSV = `NOME,QNT
AROMA,KG
CHOCOLATE ,0
 LEITINHO,45KG
 DOCE DE LEITE ,"90,00"
 BAUNILHA ,"140,00"
MORANGO,80KG
DOCE DE LEITE EXX,"7,5KG"
MATERIA 2 ,KG
GLICINA ,775KG
WPC 34 ,4205
ALBUMINA ,3940KG
MATERIA 3
MALTO,2300KG
MATERIA 4
CREATINA ,2500KG
DARK LIMÃO,0
0,`;

const PRODUTO_CSV = `NOME,QUANTIDADE,LABSKULL,UN,NYER,UN
WHEY NYER REFIL 900g CHOCOLATE,76,,,,
WHEY NYER REFIL 900g MORANGO,690,REFIL LAB SKULL 420G MORANGO,800,EMBALAGEM HIDRO MORANGO,2100
WHEY NYER REFIL 420g CHOCOLATE,564,REFIL LAB SKULL 420G CHOCOLATE ,890,EMBALAGEM HIDRO CHOCOLATE,2460
LEITINHO 1KG POTE ,651,,,REFIL 900 NYER MORANGO ,2400
DARK PUMP LIMAO,950,,,,
CREATINA 300 REFIL ,5450,,,,`;

function mockFetch(materia: string, produto: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const body = url.includes(encodeURIComponent("matéria")) ? materia : produto;
      return new Response(body, { status: 200 });
    }),
  );
}

afterEach(() => vi.restoreAllMocks());

describe("getEstoqueReport — parsing da planilha de estoque", () => {
  it("classifica produto acabado, LAB SKULL e refis/embalagens NYER", async () => {
    mockFetch(MATERIA_CSV, PRODUTO_CSV);
    const r = await getEstoqueReport();

    const whey = r.itens.find((i) => i.nome === "WHEY NYER REFIL 900g CHOCOLATE");
    expect(whey).toBeDefined();
    expect(whey!.quantidade).toBe(76);
    expect(whey!.unidade).toBe("un");
    expect(whey!.marca).toBe("NYER");

    const labskull = r.itens.find((i) => i.nome === "REFIL LAB SKULL 420G MORANGO");
    expect(labskull?.marca).toBe("LAB SKULL");
    expect(labskull?.quantidade).toBe(800);

    const embalagem = r.itens.find((i) => i.nome === "EMBALAGEM HIDRO MORANGO");
    expect(embalagem?.grupo).toBe("Refis / Embalagens / Rótulos NYER");
    expect(embalagem?.quantidade).toBe(2100);
  });

  it("normaliza quantidades de matéria-prima (KG, vírgula decimal) e seções", async () => {
    mockFetch(MATERIA_CSV, PRODUTO_CSV);
    const r = await getEstoqueReport();

    const leitinho = r.itens.find((i) => i.nome === "LEITINHO");
    expect(leitinho?.quantidade).toBe(45);
    expect(leitinho?.unidade).toBe("kg");
    expect(leitinho?.grupo).toBe("AROMA");

    const doce = r.itens.find((i) => i.nome === "DOCE DE LEITE");
    expect(doce?.quantidade).toBe(90); // "90,00" → 90

    const docerExx = r.itens.find((i) => i.nome === "DOCE DE LEITE EXX");
    expect(docerExx?.quantidade).toBe(7.5); // "7,5KG" → 7.5

    const glicina = r.itens.find((i) => i.nome === "GLICINA");
    expect(glicina?.grupo).toBe("MATERIA 2");

    const malto = r.itens.find((i) => i.nome === "MALTO");
    expect(malto?.grupo).toBe("MATERIA 3");

    // linhas de seção e a linha solta "0" não viram itens
    expect(r.itens.some((i) => i.nome === "AROMA")).toBe(false);
    expect(r.itens.some((i) => i.nome === "0")).toBe(false);
  });

  it("detecta itens zerados", async () => {
    mockFetch(MATERIA_CSV, PRODUTO_CSV);
    const r = await getEstoqueReport();
    const zerados = r.itens.filter((i) => i.quantidade === 0).map((i) => i.nome);
    expect(zerados).toContain("CHOCOLATE");
    expect(zerados).toContain("DARK LIMÃO");
  });

  it("estima valor a custo apenas para produtos acabados NYER conhecidos", async () => {
    mockFetch(MATERIA_CSV, PRODUTO_CSV);
    const r = await getEstoqueReport();

    const whey900 = r.itens.find((i) => i.nome === "WHEY NYER REFIL 900g CHOCOLATE");
    expect(whey900!.custoUnit).toBeGreaterThan(0);
    expect(whey900!.valor).toBe(whey900!.custoUnit! * 76);

    // LAB SKULL e embalagens não recebem custo
    const labskull = r.itens.find((i) => i.nome === "REFIL LAB SKULL 420G MORANGO");
    expect(labskull!.valor).toBeUndefined();

    expect(r.resumo.valorEstimado).toBeGreaterThan(0);
    expect(r.resumo.itensComCusto).toBeGreaterThanOrEqual(3);
  });

  it("erro amigável quando a planilha não é pública (HTML em vez de CSV)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html><body>Sign in</body></html>", { status: 200 })),
    );
    await expect(getEstoqueReport()).rejects.toBeInstanceOf(EstoqueIndisponivelError);
  });
});
