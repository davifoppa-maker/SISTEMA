import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  buildAuthorizationUrl,
  exchangeCodeForTokens,
  getValidAccessToken,
  isTinyConfigured,
  mapV3OrderToPayload,
} from "@/lib/services/tiny-api";
import { clearTokens } from "@/lib/services/tiny-tokens";

beforeEach(async () => {
  process.env.TINY_CLIENT_ID = "cid";
  process.env.TINY_CLIENT_SECRET = "secret";
  process.env.TINY_REDIRECT_URI = "https://app.exemplo.com/api/auth/tiny/callback";
  delete process.env.TINY_ACCESS_TOKEN;
  delete process.env.TINY_REFRESH_TOKEN;
  await clearTokens();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Tiny OAuth", () => {
  it("isTinyConfigured reflete client_id/secret", () => {
    expect(isTinyConfigured()).toBe(true);
  });

  it("buildAuthorizationUrl monta a URL do Keycloak com os parâmetros corretos", () => {
    const url = new URL(buildAuthorizationUrl("xyz"));
    expect(url.origin + url.pathname).toBe(
      "https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/auth",
    );
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("cid");
    expect(url.searchParams.get("state")).toBe("xyz");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://app.exemplo.com/api/auth/tiny/callback",
    );
  });

  it("exchangeCodeForTokens troca o code, persiste e devolve um access_token válido", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "AT123",
          refresh_token: "RT123",
          expires_in: 3600,
          scope: "openid offline_access",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const tokens = await exchangeCodeForTokens("authcode");
    expect(tokens.access_token).toBe("AT123");
    expect(tokens.refresh_token).toBe("RT123");

    // O endpoint de token deve ser chamado com Basic auth e grant authorization_code.
    const [, init] = fetchMock.mock.calls[0];
    expect((init.headers as Record<string, string>).Authorization).toMatch(/^Basic /);
    expect(String(init.body)).toContain("grant_type=authorization_code");

    // Token recém-obtido (não expirado) é retornado sem novo fetch.
    const at = await getValidAccessToken();
    expect(at).toBe("AT123");
  });

  it("getValidAccessToken renova quando o token está expirado", async () => {
    // 1ª chamada: troca code por token já expirado (expires_in=0).
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "OLD", refresh_token: "RT", expires_in: 0 }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "NEW", refresh_token: "RT2", expires_in: 3600 }), {
          status: 200,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await exchangeCodeForTokens("authcode");
    const at = await getValidAccessToken();
    expect(at).toBe("NEW");
    const [, refreshInit] = fetchMock.mock.calls[1];
    expect(String(refreshInit.body)).toContain("grant_type=refresh_token");
  });
});

describe("mapV3OrderToPayload", () => {
  it("normaliza um pedido da API V3 para o formato de ingestão", () => {
    const v3 = {
      id: 999,
      numeroPedido: "12345",
      situacao: "aprovado",
      valorTotal: 250.5,
      ecommerce: { nome: "Mercos" },
      cliente: {
        nome: "Cliente V3",
        cpfCnpj: "11.222.333/0001-44",
        endereco: { municipio: "Joinville", uf: "SC" },
      },
      itens: [{ codigo: "SKU1", descricao: "Produto", quantidade: 2, valorUnitario: 125.25 }],
    };
    const p = mapV3OrderToPayload(v3 as any);
    expect(p.numero).toBe("12345");
    expect(p.valor).toBe(250.5);
    expect(p.cliente?.cpf_cnpj).toBe("11.222.333/0001-44");
    expect(p.cliente?.cidade).toBe("Joinville");
    expect(p.itens?.[0]?.codigo).toBe("SKU1");
    expect((p as any).raw_payload).toBe(v3);
  });

  it("lê a situação do endpoint de detalhe (codigoSituacao/descricaoSituacao)", () => {
    // O detalhe por id NÃO traz `situacao`; traz codigoSituacao/descricaoSituacao.
    const v3 = {
      id: "904011470",
      numero: "69741",
      codigoSituacao: "enviado",
      descricaoSituacao: "Enviado",
      formaEnvio: { id: "774193196", descricao: "Retirar pessoalmente" },
      cliente: { nome: "Maria do Céu", cpfCnpj: "397.461.512-15" },
    };
    const p = mapV3OrderToPayload(v3 as any);
    // "enviado" deve ser preservado (e mapeado para aguardando_coleta na ingestão).
    expect(p.situacao).toBe("enviado");
    expect(p.transportadora).toBe("Retirar pessoalmente");
  });
});
