import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { quoteJadlog, trackJadlog, isJadlogConfigured } from "@/lib/services/freight/jadlog";
import { getProvider } from "@/lib/services/freight/registry";

beforeEach(() => {
  process.env.JADLOG_TOKEN = "jwt.token.aqui";
  process.env.JADLOG_CONTA = "123966";
  process.env.JADLOG_CNPJ = "33042107000151";
  process.env.JADLOG_MODALIDADE = "3";
  process.env.JADLOG_CEP_ORIGEM = "88750000";
});
afterEach(() => vi.restoreAllMocks());

describe("cotação JadLog", () => {
  it("monta o body (Bearer, modalidade, conta) e lê vltotal/prazo", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ frete: [{ vltotal: 33.9, prazo: 4 }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const out = await quoteJadlog({
      cnpjDestinatario: "12345678000190",
      cepDestino: "20040-000",
      vlrMercadoria: 250,
      peso: 5,
      volumes: 1,
      cubagem: [{ altura: 0.4, largura: 0.3, comprimento: 0.3, volumes: 1 }],
    });

    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.data.totalFrete).toBe(33.9);
      expect(out.data.prazo).toBe(4);
    }

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://www.jadlog.com.br/embarcador/api/frete/valor");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer jwt.token.aqui");
    const body = JSON.parse(String(init.body));
    expect(body.frete[0].modalidade).toBe(3);
    expect(body.frete[0].conta).toBe("123966");
    expect(body.frete[0].cepdes).toBe("20040000"); // sem máscara
    expect(body.frete[0].cepori).toBe("88750000");
  });

  it("usa o peso CUBADO quando maior que o real (fator 300 kg/m³)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ frete: [{ vltotal: 50, prazo: 3 }] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    // 1 volume 0,5×0,5×0,5 = 0,125 m³ → cubado 37,5 kg > 5 kg real.
    await quoteJadlog({
      cnpjDestinatario: "1",
      cepDestino: "20040000",
      vlrMercadoria: 100,
      peso: 5,
      volumes: 1,
      cubagem: [{ altura: 0.5, largura: 0.5, comprimento: 0.5, volumes: 1 }],
    });
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body.frete[0].peso).toBeCloseTo(37.5, 1);
  });

  it("propaga erro retornado por item (sem vltotal)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ frete: [{ error: { id: 9, descricao: "CEP nao atendido" } }] }), { status: 200 }),
      ),
    );
    const out = await quoteJadlog({
      cnpjDestinatario: "1",
      cepDestino: "20040000",
      vlrMercadoria: 100,
      peso: 1,
      volumes: 1,
      cubagem: [{ altura: 0.1, largura: 0.1, comprimento: 0.1, volumes: 1 }],
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toContain("CEP nao atendido");
  });

  it("falha sem token", async () => {
    process.env.JADLOG_TOKEN = "";
    const out = await quoteJadlog({
      cnpjDestinatario: "1",
      cepDestino: "20040000",
      vlrMercadoria: 100,
      peso: 1,
      volumes: 1,
      cubagem: [{ altura: 0.1, largura: 0.1, comprimento: 0.1, volumes: 1 }],
    });
    expect(out.ok).toBe(false);
  });
});

describe("rastreio JadLog (por shipmentId)", () => {
  it("consulta pelo shipmentId e normaliza tracking aninhado", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          consulta: [
            {
              shipmentId: "12396600024828",
              tracking: {
                status: "TRANSFERIDO PARA UNIDADE",
                nf: "253926",
                eventos: [
                  { data: "2026-06-09 17:13:06", status: "COLETA SOLICITADA", unidade: "CO TUBARAO 01" },
                  { data: "2026-06-14 10:08:20", status: "TRANSFERIDO PARA UNIDADE", unidade: "MT JADLOG SEDE" },
                ],
              },
              previsaoEntrega: "2026-06-30",
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const out = await trackJadlog("12396600024828");
    expect(out.ok).toBe(true);
    if (out.ok) {
      const s = out.data.shipments[0];
      expect(s.status).toBe("TRANSFERIDO PARA UNIDADE");
      expect(s.numero).toBe("253926");
      expect(s.previsaoEntrega).toBe("2026-06-30");
      expect(s.entregue).toBe(false);
      expect(s.timeline).toHaveLength(2);
      expect(s.timeline[0].data).toBe("2026-06-09T17:13:06"); // data normalizada p/ ISO
    }
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://www.jadlog.com.br/embarcador/api/tracking/consultar");
    expect(String(init.body)).toContain("shipmentId");
    expect(String(init.body)).toContain("12396600024828");
  });

  it("detecta entrega concluída (status ENTREGUE → entregue + dataEntrega)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          consulta: [
            {
              shipmentId: "12396600024828",
              tracking: {
                status: "ENTREGUE",
                eventos: [
                  { data: "2026-06-14 10:08:20", status: "SAIDA PARA ENTREGA", unidade: "MT JADLOG SEDE" },
                  { data: "2026-06-15 14:32:00", status: "ENTREGUE", unidade: "URUBICI" },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const out = await trackJadlog("12396600024828");
    expect(out.ok).toBe(true);
    if (out.ok) {
      const s = out.data.shipments[0];
      expect(s.entregue).toBe(true);
      expect(s.dataEntrega).toBe("2026-06-15T14:32:00");
    }
  });

  it("'não localizado' vira shipment sem timeline (não quebra)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ consulta: [{ erro: { id: -1, descricao: "Não localizado" } }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    const out = await trackJadlog("99999999999999");
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.data.shipments[0].entregue).toBe(false);
      expect(out.data.shipments[0].timeline).toHaveLength(0);
    }
  });
});

describe("registro", () => {
  it("JadLog registrada e configurada", () => {
    expect(getProvider("jadlog")?.label).toBe("JadLog");
    expect(isJadlogConfigured()).toBe(true);
  });
});
