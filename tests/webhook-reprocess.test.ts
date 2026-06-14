import { describe, it, expect, afterEach, vi } from "vitest";
import { buildSeedStore } from "@/lib/db/seed";
import {
  ingestOrder,
  registerWebhook,
  applyTinyStatusByTinyId,
  reprocessPendingWebhooks,
} from "@/lib/services/tiny";
import { tinyOrderSchema } from "@/lib/validation/schemas";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const basePayload = {
  id: "tiny-88001",
  numero: "88001",
  situacao: "aprovado",
  valor: 900,
  ecommerce: { nome: "Mercos" },
  cliente: { nome: "Cliente Webhook", cpf_cnpj: "44.000.000/0001-00" },
  itens: [{ codigo: "A", descricao: "Item", quantidade: 1, valor_unitario: 900 }],
};

describe("fallback de status do webhook (sem detalhe do Tiny)", () => {
  it("move o B2B para expedição usando só o status do evento", () => {
    const store = buildSeedStore();
    const order = ingestOrder(store, tinyOrderSchema.parse(basePayload));
    expect(order.logistic_status).toBe("aguardando_separacao");

    const applied = applyTinyStatusByTinyId(store, "tiny-88001", "ENVIADO", "Rodonaves");
    expect(applied?.id).toBe(order.id);
    expect(order.logistic_status).toBe("aguardando_coleta");
    // entrou no checkout de expedição
    expect(store.shipments.some((s) => s.order_id === order.id && s.status === "aguardando_coleta")).toBe(true);
  });

  it("retorna null se o pedido não existe ou não há situação", () => {
    const store = buildSeedStore();
    expect(applyTinyStatusByTinyId(store, "nao-existe", "enviado")).toBeNull();
    const order = ingestOrder(store, tinyOrderSchema.parse(basePayload));
    expect(applyTinyStatusByTinyId(store, order.tiny_id!, "")).toBeNull();
  });
});

describe("reprocesso de webhooks pendentes", () => {
  it("processa evento 'received' aplicando o status do payload quando o detalhe falha", async () => {
    // Sem credenciais do Tiny: fetchOrderById falha → cai no fallback de status.
    vi.stubEnv("TINY_CLIENT_ID", "");
    vi.stubEnv("TINY_CLIENT_SECRET", "");

    const store = buildSeedStore();
    const order = ingestOrder(store, tinyOrderSchema.parse(basePayload));

    const { event } = registerWebhook(store, "tiny", "order.webhook", null, {
      tipo: "atualizacao_pedido",
      dados: { id: "tiny-88001", codigoSituacao: "enviado" },
    });
    expect(event.status).toBe("received");

    const n = await reprocessPendingWebhooks(store);
    expect(n).toBe(1);
    expect(event.status).toBe("processed");
    expect(order.logistic_status).toBe("aguardando_coleta");
  });

  it("ignora eventos sem id e mantém pendente quando nada se aplica", async () => {
    vi.stubEnv("TINY_CLIENT_ID", "");
    vi.stubEnv("TINY_CLIENT_SECRET", "");

    const store = buildSeedStore();
    const { event } = registerWebhook(store, "tiny", "order.webhook", null, {
      dados: { codigoSituacao: "enviado" }, // sem id
    });
    const n = await reprocessPendingWebhooks(store);
    expect(n).toBe(0);
    expect(event.status).toBe("received");
  });
});
