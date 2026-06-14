import { loadStore, commitStore } from "@/lib/db";
import { ok } from "@/lib/api";
import { tinyInvoiceSchema } from "@/lib/validation/schemas";
import { ingestInvoice, registerWebhook } from "@/lib/services/tiny";
import { nowIso } from "@/lib/utils/ids";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function readBody(req: Request): Promise<any> {
  const ct = req.headers.get("content-type") || "";
  const text = await req.text();
  if (!text) return {};
  if (ct.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(text);
    const dados = params.get("dados");
    if (dados) {
      try { return JSON.parse(dados); } catch { return { dados }; }
    }
    const obj: Record<string, string> = {};
    params.forEach((v, k) => (obj[k] = v));
    return obj;
  }
  try { return JSON.parse(text); } catch { return { _raw: text }; }
}

// Normaliza uma NF vinda do webhook (nomes de campo variam) para o schema interno.
function mapInvoice(e: any) {
  return {
    pedido_numero: e.numeroPedido ?? e.pedido?.numero ?? e.pedido_numero ?? e.idPedido ?? e.pedido,
    numero: e.numero ?? e.numeroNota ?? e.nNF,
    serie: e.serie,
    chave_acesso: e.chaveAcesso ?? e.chave_acesso ?? e.chaveNfe ?? e.chave,
    valor: e.valor ?? e.valorNota ?? e.valorTotal,
    data_emissao: e.dataEmissao ?? e.data_emissao ?? e.data,
    transportadora: e.transportadora ?? e.nomeTransportador ?? e.transportador?.nome,
    volumes: e.volumes ?? e.qtdVolumes ?? e.quantidadeVolumes,
    peso: e.peso ?? e.pesoBruto,
  };
}

// Ativa o fluxo logístico quando a NF é emitida. Tolerante a formato; sempre 200.
export async function POST(req: Request) {
  const payload = await readBody(req);

  const store = await loadStore();
  const { event, duplicate } = registerWebhook(store, "tiny", "invoice.webhook", null, payload);
  if (duplicate) return ok({ duplicate: true, webhook_event_id: event.id });

  try {
    const entity = payload?.dados ?? payload?.notaFiscal ?? payload?.nota ?? payload;
    const result = ingestInvoice(store, tinyInvoiceSchema.parse(mapInvoice(entity)));
    event.status = result ? "processed" : "error";
    event.processed_at = nowIso();
    if (!result) event.error_message = "Pedido não encontrado para a NF.";
    await commitStore(store);
    return ok(
      result
        ? { invoice_id: result.invoice.id, shipment_id: result.shipment.id, webhook_event_id: event.id }
        : { received: true, processed: false, reason: "pedido_nao_encontrado", webhook_event_id: event.id },
    );
  } catch (err) {
    event.status = "error";
    event.error_message = err instanceof Error ? err.message : "erro";
    await commitStore(store);
    return ok({ received: true, processed: false, webhook_event_id: event.id });
  }
}
