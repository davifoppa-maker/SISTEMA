import { loadStore, commitStore } from "@/lib/db";
import { ok } from "@/lib/api";
import { tinyOrderSchema } from "@/lib/validation/schemas";
import { ingestOrder, registerWebhook, applyTinyStatusByTinyId } from "@/lib/services/tiny";
import { fetchOrderById, fetchOrderNF } from "@/lib/services/tiny-api";
import { nowIso, uuid } from "@/lib/utils/ids";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Lê o corpo do webhook de forma tolerante: aceita JSON ou form-urlencoded
// (o Tiny pode enviar o conteúdo dentro de um campo "dados").
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

// Webhook de pedidos do Tiny: salva o bruto com idempotência, processa de forma
// tolerante (entende v2/v3 e payload "embrulhado" em dados/pedido) e SEMPRE
// responde 200 — o Tiny reenvia em caso de não-200, e o bruto fica salvo para
// reprocesso/inspeção em /raw-payload.
export async function POST(req: Request) {
  const empresaParam = new URL(req.url).searchParams.get("empresa");
  const companyId = empresaParam === "ecopro" ? "ecopro" : "nyer";
  // Tudo dentro de try/catch: o webhook NUNCA devolve 5xx. Sob rajada, se uma
  // leitura/escrita do banco falhar, respondemos 200 (o Tiny não re-tenta em
  // massa) e o sync/cron/botão reprocessa depois. Evita o alerta de 5xx.
  let store: Awaited<ReturnType<typeof loadStore>> | null = null;
  let event: import("@/lib/types").WebhookEvent | null = null;
  try {
    const payload = await readBody(req);
    store = await loadStore();
    const reg = registerWebhook(store, "tiny", "order.webhook", null, payload);
    event = reg.event;
    if (reg.duplicate) {
      return ok({ duplicate: true, webhook_event_id: event.id });
    }

    const entity = payload?.dados ?? payload?.pedido ?? payload;
    const tipo = String(payload?.tipo ?? "");

    // Notificação de RASTREIO: salva código/URL de rastreio na expedição do pedido.
    if (tipo === "rastreio" || entity?.codigoRastreio || entity?.urlRastreio) {
      const tinyId = String(entity?.idVendaTiny ?? entity?.idVenda ?? entity?.id ?? "");
      const order = tinyId ? store.orders.find((o) => o.tiny_id === tinyId) : null;
      const shipment = order ? store.shipments.find((s) => s.order_id === order.id) : null;
      if (shipment) {
        if (entity?.codigoRastreio) shipment.tracking_code = String(entity.codigoRastreio);
        if (entity?.urlRastreio) shipment.tracking_url = String(entity.urlRastreio);
        shipment.updated_at = nowIso();
      }
      event.status = "processed";
      event.processed_at = nowIso();
      await commitStore(store);
      return ok({ rastreio: true, matched: Boolean(shipment), webhook_event_id: event.id });
    }

    // Notificação de PEDIDO: o payload do webhook é LEVE (sem itens/valor/endereço)
    // e traz o status em codigoSituacao. Buscamos o pedido COMPLETO no Tiny (pelo
    // id) — fonte autoritativa — para não sobrescrever dados com vazio.
    const tinyId = String(entity?.id ?? entity?.idPedido ?? "");
    // Rajadas (vários pedidos movidos de uma vez) podem esbarrar em rate limit do
    // Tiny — tenta de novo após uma pausa antes de cair no fallback.
    let full = tinyId ? await fetchOrderById(tinyId, companyId).catch(() => null) : null;
    if (!full && tinyId) {
      await sleep(1200);
      full = await fetchOrderById(tinyId, companyId).catch(() => null);
    }
    if (!full) {
      // Sem detalhe (Tiny indisponível): aplica ao menos o STATUS que veio no
      // próprio webhook — é o que move o pedido de etapa em tempo real (ex.:
      // "enviado" → checkout de expedição). O sync seguinte completa o resto.
      const applied = applyTinyStatusByTinyId(
        store,
        tinyId,
        entity?.descricaoSituacao ?? entity?.codigoSituacao,
        entity?.transportador?.nome ?? entity?.formaEnvio?.descricao ?? null,
      );
      if (applied) {
        event.status = "processed";
        event.processed_at = nowIso();
        store.api_sync_logs.push({
          id: uuid(),
          source: "tiny",
          operation: "webhook_order",
          ok: true,
          detail: `pedido ${applied.order_number} status ${applied.logistic_status} (fallback sem detalhe)`,
          created_at: nowIso(),
        });
        await commitStore(store);
        return ok({ order_id: applied.id, status: applied.logistic_status, fallback: true, webhook_event_id: event.id });
      }
      // Nem o fallback achou o pedido: mantém o bruto salvo; o próximo sync
      // (botão "atualizar" ou cron) reprocessa via reprocessPendingWebhooks.
      event.status = "received";
      await commitStore(store);
      return ok({ received: true, pending_detail: true, webhook_event_id: event.id });
    }

    // O status do webhook é o sinal mais fresco (o detalhe do Tiny pode demorar
    // um instante para refletir). Usa a situação do evento como autoritativa.
    const situacaoEvento = entity?.descricaoSituacao ?? entity?.codigoSituacao;
    if (situacaoEvento) {
      (full as Record<string, unknown>).situacao = String(situacaoEvento).toLowerCase().replace(/_/g, " ");
    }

    const order = ingestOrder(store, tinyOrderSchema.parse(full), companyId);

    // Tempo real: se entrou em expedição (B2B "enviado") e ainda não tem NF,
    // puxa a nota agora (número + chave + frete + prazo) para o checkout já funcionar.
    if (
      order.channel === "b2b_mercos" &&
      order.logistic_status === "aguardando_coleta" &&
      (!order.nf_chave || !order.expected_delivery_at) &&
      order.tiny_id
    ) {
      try {
        const nf = await fetchOrderNF(order.tiny_id);
        if (nf && (nf.chave || nf.numero)) {
          order.nf_chave = nf.chave;
          order.nf_numero = nf.numero;
          if (nf.valorFrete != null) order.freight_value = nf.valorFrete;
          const sh = store.shipments.find((s) => s.order_id === order.id);
          if (nf.dataPrevista) {
            order.expected_delivery_at = nf.dataPrevista;
            if (sh && !sh.delivered_at) sh.estimated_delivery_at = nf.dataPrevista;
          }
          if (nf.codigoRastreamento && sh && !sh.tracking_code) {
            sh.tracking_code = nf.codigoRastreamento;
            if (nf.urlRastreamento) sh.tracking_url = nf.urlRastreamento;
          }
          order.updated_at = nowIso();
        }
      } catch {
        /* NF pode ainda não estar pronta; o cron preenche depois */
      }
    }

    event.status = "processed";
    event.processed_at = nowIso();
    store.api_sync_logs.push({
      id: uuid(),
      source: "tiny",
      operation: "webhook_order",
      ok: true,
      detail: `pedido ${order.order_number} canal ${order.channel} status ${order.logistic_status}`,
      created_at: nowIso(),
    });
    await commitStore(store);
    return ok({ order_id: order.id, channel: order.channel, status: order.logistic_status, webhook_event_id: event.id });
  } catch (err) {
    // Tenta registrar o erro no evento e responder 200 (sem 5xx). Se nem isso
    // for possível (ex.: banco sobrecarregado), responde 200 mesmo assim.
    try {
      if (store && event) {
        event.status = "error";
        event.error_message = err instanceof Error ? err.message : "erro";
        await commitStore(store);
      }
    } catch {
      /* ignora — o importante é responder 200 e não derrubar com 5xx */
    }
    return ok({ received: true, processed: false, deferred: true });
  }
}
