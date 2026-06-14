import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { quoteFreight, isBraspressConfigured, trackByNf } from "@/lib/services/braspress";
import { getProvider, listProviders } from "@/lib/services/freight/registry";

beforeEach(() => {
  process.env.BRASPRESS_USER = "user_prd";
  process.env.BRASPRESS_PASSWORD = "secret";
  process.env.BRASPRESS_CNPJ_REMETENTE = "33042107000151";
  process.env.BRASPRESS_CEP_ORIGEM = "88750000";
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Braspress cotação", () => {
  it("isBraspressConfigured reflete as credenciais", () => {
    expect(isBraspressConfigured()).toBe(true);
  });

  it("monta o payload (CNPJ/CEP só dígitos como número) e usa Basic Auth", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 1, prazo: 3, totalFrete: 123.45, validade: "2026-06-10" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const out = await quoteFreight({
      cnpjDestinatario: "305.393.568-67",
      cepDestino: "07093-090",
      vlrMercadoria: 100,
      peso: 50.55,
      volumes: 10,
      cubagem: [{ altura: 0.46, largura: 0.67, comprimento: 0.67, volumes: 10 }],
    });

    expect(out.ok).toBe(true);
    if (out.ok) expect(out.data.totalFrete).toBe(123.45);

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://api.braspress.com/v1/cotacao/calcular/json");
    expect((init.headers as Record<string, string>).Authorization).toMatch(/^Basic /);
    const body = JSON.parse(String(init.body));
    expect(body.cnpjRemetente).toBe(33042107000151);
    expect(body.cnpjDestinatario).toBe(30539356867); // sem máscara
    expect(body.cepOrigem).toBe(88750000);
    expect(body.cepDestino).toBe(7093090); // zero à esquerda some ao virar número (igual ao exemplo da doc)
    expect(body.modal).toBe("R");
    expect(body.tipoFrete).toBe("1");
  });

  it("retorna erro tratado quando a Braspress responde não-2xx", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "Credenciais inválidas" }), { status: 401 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const out = await quoteFreight({
      cnpjDestinatario: "30539356867",
      cepDestino: "07093090",
      vlrMercadoria: 100,
      peso: 1,
      volumes: 1,
      cubagem: [{ altura: 0.1, largura: 0.1, comprimento: 0.1, volumes: 1 }],
    });

    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error).toContain("Credenciais inválidas");
      expect(out.status).toBe(401);
    }
  });

  it("falha sem cubagem", async () => {
    const out = await quoteFreight({
      cnpjDestinatario: "30539356867",
      cepDestino: "07093090",
      vlrMercadoria: 100,
      peso: 1,
      volumes: 1,
      cubagem: [],
    });
    expect(out.ok).toBe(false);
  });
});

describe("Braspress tracking", () => {
  it("rastreia por NF (CNPJ remetente + NF na URL) e normaliza a timeline", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          conhecimentos: [
            {
              statusEntrega: "EM TRANSITO",
              numero: "12345",
              origem: "Braço do Norte/SC",
              destino: "Orleans/SC",
              previsaoEntrega: "2026-06-12",
              timeLine: [{ data: "2026-06-09 10:00", descricao: "Coletado", local: "Braço do Norte" }],
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const out = await trackByNf("12345");
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.data.shipments).toHaveLength(1);
      expect(out.data.shipments[0].status).toBe("EM TRANSITO");
      expect(out.data.shipments[0].timeline[0].descricao).toBe("Coletado");
    }

    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://api.braspress.com/v1/tracking/33042107000151/12345/json");
  });

  it("trata 404 como nada encontrado", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 404 })));
    const out = await trackByNf("999");
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.status).toBe(404);
  });
});

describe("Registro de transportadoras", () => {
  it("resolve a Braspress e cai nela por padrão", () => {
    expect(getProvider("braspress")?.id).toBe("braspress");
    expect(getProvider()?.id).toBe("braspress");
    expect(getProvider("BRASPRESS")?.id).toBe("braspress");
  });
  it("retorna null para transportadora desconhecida", () => {
    expect(getProvider("inexistente")).toBeNull();
  });
  it("lista as transportadoras registradas", () => {
    expect(listProviders().map((p) => p.id)).toContain("braspress");
  });
});
