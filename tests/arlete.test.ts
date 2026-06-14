import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mercadoriaCodeForCep } from "@/lib/services/freight/data/arlete-mercadoria";
import { quoteArlete, trackArlete, isArleteConfigured } from "@/lib/services/freight/arlete";
import { getProvider } from "@/lib/services/freight/registry";

beforeEach(() => {
  process.env.SSW_LOGIN = "33042107";
  process.env.SSW_SENHA = "exx#2235";
  process.env.SSW_DOMINIO = "ARL";
  process.env.SSW_CNPJ_PAGADOR = "33042107000151";
  process.env.SSW_CEP_ORIGEM = "88750000";
});
afterEach(() => vi.restoreAllMocks());

describe("código de mercadoria por CEP (tabela ARLETE)", () => {
  it("zona local (Campinas/SP) = 001", () => {
    expect(mercadoriaCodeForCep("13050000")).toBe(1);
  });
  it("litoral SP (Guarujá) = 093", () => {
    expect(mercadoriaCodeForCep("11450000")).toBe(93);
  });
  it("RJ (Angra) e DF (Taguatinga) = 100", () => {
    expect(mercadoriaCodeForCep("23950000")).toBe(100);
    expect(mercadoriaCodeForCep("72150000")).toBe(100);
  });
  it("CEP fora de qualquer faixa cai no padrão 001", () => {
    expect(mercadoriaCodeForCep("00000000")).toBe(1);
    expect(mercadoriaCodeForCep("")).toBe(1);
  });
  it("aceita CEP com máscara", () => {
    expect(mercadoriaCodeForCep("13050-000")).toBe(1);
  });
});

describe("cotação Arlete (SSW SOAP)", () => {
  it("monta o SOAP cotar e lê valor/prazo do <return> JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        `<?xml version="1.0"?><soap:Envelope><soap:Body><ns1:cotarResponse><return>{"frete":120.50,"prazo":3,"cotacao":"999"}</return></ns1:cotarResponse></soap:Body></soap:Envelope>`,
        { status: 200, headers: { "content-type": "text/xml" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const out = await quoteArlete({
      cnpjDestinatario: "12.345.678/0001-90",
      cepDestino: "23950000", // RJ → mercadoria 100
      vlrMercadoria: 500,
      peso: 10,
      volumes: 2,
      cubagem: [{ altura: 0.4, largura: 0.3, comprimento: 0.3, volumes: 2 }],
    });

    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.data.totalFrete).toBe(120.5);
      expect(out.data.prazo).toBe(3);
    }

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://ssw.inf.br/ws/sswCotacao/index.php");
    const body = String(init.body);
    expect(body).toMatch(/<dominio>ARL<\/dominio>/);
    // mercadoria resolvida pelo CEP de destino (3 dígitos); CEPs e valores não tipados.
    expect(body).toMatch(/<mercadoria>100<\/mercadoria>/);
    expect(body).toMatch(/<cepDestino>23950000<\/cepDestino>/);
    expect(body).toMatch(/<cepOrigem>88750000<\/cepOrigem>/);
    // Conjunto mínimo: sem senhaPagador, sem campos S/N, sem ciffob/cnpjRemetente.
    expect(body).not.toContain("senhaPagador");
    expect(body).not.toContain("entDificil");
    expect(body).not.toContain("ciffob");
    expect(body).not.toContain("cnpjRemetente");
    // Termina em cnpjDestinatario; cnpjPagador imediatamente seguido de cepOrigem.
    expect(body).toMatch(/<\/cnpjPagador>\s*<cepOrigem/);
    expect(body).toMatch(/<\/cnpjDestinatario>\s*<\/urn:cotar>/);
    // valor da NF em formato brasileiro (vírgula decimal).
    expect(body).toMatch(/<valorNF>500,00<\/valorNF>/);
  });

  it("desescapa o XML interno e propaga a mensagem real do SSW (regressão)", async () => {
    // Resposta REAL observada em produção: <return> com XML interno escapado.
    const real = `<?xml version="1.0" encoding="UTF-8"?><SOAP-ENV:Envelope SOAP-ENV:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/" xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/"><SOAP-ENV:Body><ns1:cotarResponse xmlns:ns1="urn:sswinfbr.sswCotacao"><return xsi:type="xsd:string">&lt;?xml version=&quot;1.0&quot; encoding=&quot;UTF-8&quot; ?&gt;&lt;cotacao&gt;&lt;erro&gt;-1&lt;/erro&gt;&lt;mensagem&gt;CEP DE ORIGEM INVALIDO&lt;/mensagem&gt;&lt;/cotacao&gt;</return></ns1:cotarResponse></SOAP-ENV:Body></SOAP-ENV:Envelope>`;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(real, { status: 200 })));
    const out = await quoteArlete({
      cnpjDestinatario: "123",
      cepDestino: "13050000",
      vlrMercadoria: 100,
      peso: 1,
      volumes: 1,
      cubagem: [{ altura: 0.1, largura: 0.1, comprimento: 0.1, volumes: 1 }],
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toContain("CEP DE ORIGEM INVALIDO");
  });

  it("lê valor/prazo de resposta XML interna escapada com sucesso", async () => {
    const okResp = `<Envelope><Body><cotarResponse><return>&lt;cotacao&gt;&lt;frete&gt;235,77&lt;/frete&gt;&lt;prazo&gt;4&lt;/prazo&gt;&lt;cotacao&gt;12345&lt;/cotacao&gt;&lt;/cotacao&gt;</return></cotarResponse></Body></Envelope>`;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(okResp, { status: 200 })));
    const out = await quoteArlete({
      cnpjDestinatario: "123",
      cepDestino: "13050000",
      vlrMercadoria: 100,
      peso: 1,
      volumes: 1,
      cubagem: [{ altura: 0.1, largura: 0.1, comprimento: 0.1, volumes: 1 }],
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.data.totalFrete).toBe(235.77);
      expect(out.data.prazo).toBe(4);
    }
  });

  it("propaga erro do SSW (mensagem sem valor)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(`<Envelope><return>{"erro":1,"mensagem":"Dominio invalido"}</return></Envelope>`, { status: 200 }),
      ),
    );
    const out = await quoteArlete({
      cnpjDestinatario: "123",
      cepDestino: "13050000",
      vlrMercadoria: 100,
      peso: 1,
      volumes: 1,
      cubagem: [{ altura: 0.1, largura: 0.1, comprimento: 0.1, volumes: 1 }],
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toContain("Dominio invalido");
  });
});

describe("rastreio Arlete (SSW por chave NF-e)", () => {
  it("exige chave de 44 dígitos", async () => {
    const out = await trackArlete("12345"); // número, não chave
    expect(out.ok).toBe(false);
  });
  it("chama trackingdanfe com a chave e normaliza (formato real: documento/header/tracking)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          message: "Documento localizado com sucesso",
          documento: {
            header: { remetente: "Exx", destinatario: "Cliente", nro_nf: "253996" },
            tracking: [
              { data_hora: "2026-06-09T10:00:00", ocorrencia: "DOCUMENTO DE TRANSPORTE EMITIDO (80)", cidade: "TUBARAO / SC", descricao: "Previsao de entrega: 12/06/26." },
              { data_hora: "2026-06-11T17:21:14", ocorrencia: "SAIDA PARA ENTREGA (85)", cidade: "LAGES / SC", codigo_ssw: "85" },
            ],
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const chave = "4".padEnd(44, "1"); // 44 dígitos
    const out = await trackArlete(chave);
    expect(out.ok).toBe(true);
    if (out.ok) {
      const s = out.data.shipments[0];
      expect(s.status).toBe("SAIDA PARA ENTREGA"); // último evento, sem o sufixo "(85)"
      expect(s.numero).toBe("253996");
      expect(s.previsaoEntrega).toBe("2026-06-12");
      expect(s.entregue).toBe(false);
      expect(s.timeline).toHaveLength(2);
    }
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://ssw.inf.br/api/trackingdanfe");
    expect(String(init.body)).toContain(chave);
  });

  it("detecta entrega concluída (ENTREGA REALIZADA → entregue + dataEntrega)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          documento: {
            header: { nro_nf: "100" },
            tracking: [
              { data_hora: "2026-06-11T17:21:14", ocorrencia: "SAIDA PARA ENTREGA (85)", cidade: "LAGES / SC" },
              { data_hora: "2026-06-12T09:30:00", data_hora_efetiva: "2026-06-12T09:30:00", ocorrencia: "ENTREGA REALIZADA (1)", cidade: "URUBICI / SC", codigo_ssw: "1" },
            ],
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const out = await trackArlete("4".padEnd(44, "1"));
    expect(out.ok).toBe(true);
    if (out.ok) {
      const s = out.data.shipments[0];
      expect(s.entregue).toBe(true);
      expect(s.status).toBe("entregue");
      expect(s.dataEntrega).toBe("2026-06-12T09:30:00");
    }
  });
});

describe("registro", () => {
  it("Arlete está registrada e configurada", () => {
    expect(getProvider("arlete")?.label).toBe("Arlete (SSW)");
    expect(isArleteConfigured()).toBe(true);
  });
});
