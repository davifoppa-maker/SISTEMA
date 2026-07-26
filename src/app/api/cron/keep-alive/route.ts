import { loadStoreFor, commitStore } from "@/lib/db";
import { ok } from "@/lib/api";
import { ingestOrder, enrichOrderItems, removeDeletedOlistOrders } from "@/lib/services/tiny";
import { tinyOrderSchema } from "@/lib/validation/schemas";
import { fetchRecentOrders, getValidAccessToken, isTinyConnected } from "@/lib/services/tiny-api";
import { syncUnknownProducts } from "@/lib/catalog";
import { syncPayablesAllCompanies } from "@/lib/services/financeiro-sync";
import { nowIso, uuid } from "@/lib/utils/ids";
import type { DataStore } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Hobby limita a 10s, mas mantém compat. em planos pagos.

const COMPANIES = ["nyer", "ecopro"] as const;

// Cron diário de manutenção. Faz DUAS coisas essenciais para o app nunca "morrer":
//   1) RENOVA os tokens das duas contas (mantém o refresh_token vivo — foi o que
//      faltou e derrubou tudo por 9 dias). Como o access_token expira a cada ~4h e
//      o cron roda 1x/dia, a renovação diária mantém a rotação sempre fresca.
//   2) SINCRONIZA os pedidos recentes das duas empresas (rede de segurança caso um
//      webhook se perca). Gravação leve (lista), sem estourar o tempo.
// Também aceita GET para poder rodar manualmente pelo navegador em diagnóstico.
export async function GET() {
  return run();
}
export async function POST() {
  return run();
}

async function run() {
  const diag: Record<string, unknown> = {};

  // 1) Keep-alive dos tokens.
  const tokens: Record<string, string> = {};
  for (const empresa of COMPANIES) {
    try {
      await getValidAccessToken(empresa);
      tokens[empresa] = "ok";
    } catch (e) {
      tokens[empresa] = e instanceof Error ? e.message : "erro";
    }
  }
  diag.tokens = tokens;

  // 2) Sync dos pedidos recentes das duas empresas. Janela de 45 dias e PAGINADO
  //    para reprocessar o STATUS de mais pedidos — assim CANCELAMENTOS de pedidos
  //    um pouco mais antigos refletem no nosso banco (e saem do faturamento).
  const tables: Array<keyof DataStore> = ["orders", "customers", "invoices", "shipments", "order_items", "api_sync_logs", "carriers", "shipment_volumes", "channel_detection_rules", "audit_logs", "sla_records"];
  const dataInicial = new Date(Date.now() - 45 * 86400000).toISOString().slice(0, 10);

  let synced = 0;
  try {
    const store = await loadStoreFor(tables);
    for (const empresa of COMPANIES) {
      if (!(await isTinyConnected(empresa).catch(() => false))) continue;
      // Até 5 páginas de 100 (500 pedidos/conta) — cobre a janela sem estourar o tempo.
      for (let offset = 0; offset < 500; offset += 100) {
        const list = await fetchRecentOrders({ dataInicial, limit: 100, offset }, empresa).catch(() => []);
        if (list.length === 0) break;
        for (const payload of list) {
          try {
            ingestOrder(store, tinyOrderSchema.parse(payload), empresa);
            synced++;
          } catch { /* ignora pedido inválido */ }
        }
        if (list.length < 100) break;
      }
    }
    // Grava os STATUS já sincronizados antes das partes pesadas (itens/remoção).
    // Assim, se a função expirar no meio, os cancelamentos não se perdem.
    await commitStore(store).catch(() => {});
    // Preenche os itens de pedidos que ainda não têm (usa a conta certa de cada).
    // Lote modesto para caber no tempo; os demais entram nas próximas execuções.
    let itensPreenchidos = 0;
    try {
      itensPreenchidos = await enrichOrderItems(store, 30);
    } catch (e) {
      diag.itensErr = e instanceof Error ? e.message : String(e);
    }
    diag.itensPreenchidos = itensPreenchidos;

    // Apaga do nosso banco os pedidos que foram deletados no Olist (só 404 confirmado).
    let removidos = 0;
    try {
      const r = await removeDeletedOlistOrders(store, { cap: 12 });
      removidos = r.removed;
      diag.pedidosRemovidos = r.removed;
      diag.pedidosVerificados = r.checked;
    } catch (e) {
      diag.removeErr = e instanceof Error ? e.message : String(e);
    }

    if (synced > 0 || itensPreenchidos > 0 || removidos > 0) {
      store.api_sync_logs.push({
        id: uuid(), source: "tiny", operation: "cron_keep_alive", ok: true,
        detail: `${synced} pedidos + ${itensPreenchidos} com itens + ${removidos} removidos (desde ${dataInicial})`,
        created_at: nowIso(),
      });
      await commitStore(store);
    }
  } catch (e) {
    diag.syncErr = e instanceof Error ? e.message : String(e);
  }

  // Cadastra na aba Custos & Preços qualquer produto vendido sem custo (custo 0).
  try {
    const r = await syncUnknownProducts();
    diag.produtosNovos = r.adicionados;
  } catch (e) {
    diag.produtosErr = e instanceof Error ? e.message : String(e);
  }

  // FINANCEIRO espelhado: sincroniza contas a pagar das duas empresas (NRX+Ecopro).
  try {
    const r = await syncPayablesAllCompanies();
    diag.contasPagar = r.synced;
    diag.contasPagarDiag = r.diag;
  } catch (e) {
    diag.contasPagarErr = e instanceof Error ? e.message : String(e);
  }

  return ok({ synced, diag });
}
