import { describe, it, expect } from "vitest";
import { buildSeedStore } from "@/lib/db/seed";
import { ingestOrder, registerWebhook } from "@/lib/services/tiny";
import { sendMessage } from "@/lib/services/whatsapp";
import { tinyOrderSchema } from "@/lib/validation/schemas";

const samplePayload = {
  id: "tiny-77001",
  numero: "77001",
  numero_ecommerce: "MERCOS-77001",
  situacao: "aprovado",
  valor: 1500,
  ecommerce: { nome: "Mercos" },
  cliente: { nome: "Cliente Idem", cpf_cnpj: "55.000.000/0001-00", fone: "5547999990077" },
  itens: [{ codigo: "X", descricao: "Item", quantidade: 1, valor_unitario: 1500 }],
};

describe("idempotência", () => {
  it("webhook duplicado não cria novo evento", () => {
    const store = buildSeedStore();
    const first = registerWebhook(store, "tiny", "order", null, samplePayload);
    const second = registerWebhook(store, "tiny", "order", null, samplePayload);
    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(second.event.id).toBe(first.event.id);
  });

  it("ingestOrder duas vezes não duplica pedido", () => {
    const store = buildSeedStore();
    const before = store.orders.length;
    const parsed = tinyOrderSchema.parse(samplePayload);
    const o1 = ingestOrder(store, parsed);
    const o2 = ingestOrder(store, parsed);
    expect(o1.id).toBe(o2.id);
    expect(store.orders.length).toBe(before + 1);
  });

  it("mensagem com mesmo gatilho não é reenviada", async () => {
    const store = buildSeedStore();
    const before = store.message_logs.length;
    const input = {
      order_id: "ord-test", customer_id: "cust-test", phone: "5547999990077",
      content: "Pedido coletado", trigger_key: "EXPEDICAO_COLETADA",
    };
    const m1 = await sendMessage(store, input);
    const m2 = await sendMessage(store, input);
    expect(m1.id).toBe(m2.id);
    expect(store.message_logs.length).toBe(before + 1);
  });

  it("respeita opt-out", async () => {
    const store = buildSeedStore();
    store.message_logs.push({
      id: "in-1", order_id: null, customer_id: "c", template_id: null, trigger_key: null,
      phone: "5547000000000", direction: "inbound", content: "quero PARAR de receber",
      provider_message_id: null, status: "delivered", sent_at: null, delivered_at: null,
      read_at: null, error_message: null, created_at: new Date().toISOString(),
    });
    const m = await sendMessage(store, { phone: "5547000000000", content: "oi" });
    expect(m.status).toBe("opted_out");
  });
});
