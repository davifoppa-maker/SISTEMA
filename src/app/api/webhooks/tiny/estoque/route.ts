import { loadStore, commitStore } from "@/lib/db";
import { ok } from "@/lib/api";
import { registerWebhook } from "@/lib/services/tiny";
import { nowIso, uuid } from "@/lib/utils/ids";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Lê o corpo do webhook de forma tolerante: JSON ou form-urlencoded (o Tiny
// costuma mandar o conteúdo dentro de um campo "dados").
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

// Webhook de LANÇAMENTOS DE ESTOQUE do Tiny.
//
// IMPORTANTE: o estoque do sistema é LIDO da planilha do Google (nunca gravamos
// nela). Aqui só REGISTRAMOS o evento bruto (com idempotência) para inspeção e
// uso futuro — não alteramos a planilha nem nenhum saldo. Sempre responde 200
// para o Tiny não re-enviar em loop.
export async function POST(req: Request) {
  const empresaParam = new URL(req.url).searchParams.get("empresa");
  const companyId = empresaParam === "ecopro" ? "ecopro" : "nyer";

  let store: Awaited<ReturnType<typeof loadStore>> | null = null;
  let event: import("@/lib/types").WebhookEvent | null = null;
  try {
    const payload = await readBody(req);
    store = await loadStore();
    const reg = registerWebhook(store, "tiny", "estoque.webhook", null, payload);
    event = reg.event;
    if (reg.duplicate) {
      return ok({ duplicate: true, webhook_event_id: event.id });
    }

    const entity = payload?.dados ?? payload?.estoque ?? payload;
    const sku = String(entity?.codigo ?? entity?.sku ?? entity?.produto?.codigo ?? "");
    const saldo = entity?.saldo ?? entity?.quantidade ?? entity?.estoque ?? null;

    event.status = "processed";
    event.processed_at = nowIso();
    store.api_sync_logs.push({
      id: uuid(),
      source: "tiny",
      operation: "webhook_estoque",
      ok: true,
      detail: `estoque ${sku || "?"} saldo=${saldo ?? "?"} (${companyId}) — registrado (planilha não é alterada)`,
      created_at: nowIso(),
    });
    await commitStore(store);
    return ok({ received: true, processed: true, sku: sku || null, saldo, empresa: companyId, webhook_event_id: event.id });
  } catch (err) {
    try {
      if (store && event) {
        event.status = "error";
        event.error_message = err instanceof Error ? err.message : "erro";
        await commitStore(store);
      }
    } catch {
      /* responde 200 mesmo assim para não gerar 5xx */
    }
    return ok({ received: true, processed: false });
  }
}
