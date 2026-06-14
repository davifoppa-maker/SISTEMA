// Driver de dados Supabase: carrega o estado completo (DataStore) do Postgres e
// persiste de volta apenas o que mudou (diff por linha), preservando a mesma
// interface síncrona usada pelos serviços de domínio.
//
// Estratégia: loadSupabaseStore() lê todas as tabelas para um DataStore e guarda
// um "snapshot" (id -> JSON da linha). commitSupabaseStore() compara o estado
// atual com o snapshot e:
//   • faz upsert das linhas novas/alteradas (em ordem pai → filho), e
//   • apaga as linhas removidas (em ordem filho → pai).
// Assim não reescrevemos linhas inalteradas (não estourando o trigger de
// updated_at) e os DELETEs do app (ex.: regras de canal) são refletidos.
//
// NOTA DE ESCALA (MVP): a leitura traz todas as linhas de cada tabela. Para o
// volume inicial isso é tranquilo; conforme as tabelas de log crescerem, vale
// migrar os caminhos quentes (idempotência de webhook, listagem de pedidos) para
// consultas direcionadas.

import { getSupabaseAdmin } from "@/lib/db/supabase-store";
import type { DataStore } from "@/lib/types";

// Ordem pai → filho (respeita as foreign keys da migration 0001_init.sql).
const TABLES: (keyof DataStore)[] = [
  "users",
  "customers",
  "carriers",
  "message_templates",
  "channel_detection_rules",
  "automation_rules",
  "orders",
  "invoices",
  "shipping_batches",
  "shipments",
  "shipment_volumes",
  "order_items",
  "checkout_scans",
  "carrier_tracking_events",
  "sla_records",
  "occurrences",
  "message_logs",
  "alerts",
  "freight_quotes",
  "webhook_events",
  "api_sync_logs",
  "customer_tasks",
  "audit_logs",
];

type Snapshot = Record<string, Map<string, string>>;

// Colunas pesadas (JSON bruto) são omitidas das leituras em massa para manter as
// listagens rápidas — esses campos só são buscados sob demanda nas telas de
// detalhe/inspeção. Em UPSERT, colunas ausentes preservam o valor já gravado.
const SELECT_OVERRIDE: Record<string, string> = {
  orders:
    "id,source,source_order_id,tiny_id,order_number,external_order_number,channel,customer_id,tiny_status,logistic_status,total_value,city,state,seller,price_list,order_origin,carrier_name,nf_numero,nf_chave,freight_value,expected_delivery_at,tags,created_at,updated_at",
  invoices: "id,order_id,number,series,access_key,issued_at,total_value,xml_url,danfe_url,created_at",
  webhook_events: "id,source,event_type,external_id,idempotency_key,status,received_at,processed_at,error_message",
  carrier_tracking_events: "id,shipment_id,status,description,occurred_at,created_at",
  freight_quotes: "id,order_id,carrier_id,quote_type,request_text,quoted_value,quoted_deadline_days,status,chosen,created_at",
};

// Liga cada DataStore carregado ao seu snapshot, sem poluir o objeto.
const snapshots = new WeakMap<DataStore, Snapshot>();

// Tabelas de log/append-only: crescem sem limite e a UI não precisa do histórico
// completo. Lemos só as N mais recentes (seguro: o app nunca as edita/apaga).
const CAP_TABLES: Record<string, { column: string; limit: number }> = {
  audit_logs: { column: "created_at", limit: 1000 },
  api_sync_logs: { column: "created_at", limit: 500 },
  webhook_events: { column: "received_at", limit: 500 },
  carrier_tracking_events: { column: "created_at", limit: 1000 },
  checkout_scans: { column: "scanned_at", limit: 1000 },
  message_logs: { column: "created_at", limit: 1000 },
};

// Lê uma tabela em páginas pequenas com intervalo explícito (.range) — confiável
// mesmo em tabelas grandes (um select grande/sem intervalo pode voltar vazio
// nesta configuração do Supabase).
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function readTable(
  sb: ReturnType<typeof getSupabaseAdmin>,
  table: string,
): Promise<Array<Record<string, unknown>>> {
  const override = SELECT_OVERRIDE[table];
  // Tenta a lista de colunas otimizada; se ela falhar porque alguma coluna
  // ainda não existe (migração não rodada), cai para "*" — assim o app NUNCA
  // quebra por causa de uma coluna nova ausente.
  if (override) {
    try {
      return await readTableWith(sb, table, override);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (/column|does not exist|42703/i.test(msg)) {
        return await readTableWith(sb, table, "*");
      }
      throw e;
    }
  }
  return await readTableWith(sb, table, "*");
}

async function readTableWith(
  sb: ReturnType<typeof getSupabaseAdmin>,
  table: string,
  sel: string,
): Promise<Array<Record<string, unknown>>> {
  // Executa uma leitura com até 3 tentativas (a API do Supabase às vezes falha/
  // devolve vazio de forma intermitente nesta configuração).
  const runQuery = async (
    build: () => PromiseLike<{ data: unknown; error: { message: string } | null }>,
  ): Promise<Array<Record<string, unknown>>> => {
    let lastError: string | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data, error } = await build();
      if (!error) return (data ?? []) as Array<Record<string, unknown>>;
      lastError = error.message;
      // Coluna inexistente não adianta repetir — propaga já.
      if (/column|does not exist|42703/i.test(error.message)) {
        throw new Error(`Erro ao carregar "${table}": ${error.message}`);
      }
      await sleep(200 * (attempt + 1));
    }
    throw new Error(`Erro ao carregar "${table}": ${lastError}`);
  };

  // Tabelas de log: apenas as mais recentes (sem paginar tudo).
  const cap = CAP_TABLES[table];
  if (cap) {
    let rows = await runQuery(() =>
      sb.from(table).select(sel).order(cap.column, { ascending: false }).limit(cap.limit),
    );
    if (rows.length === 0) {
      await sleep(250);
      rows = await runQuery(() =>
        sb.from(table).select(sel).order(cap.column, { ascending: false }).limit(cap.limit),
      );
    }
    return rows;
  }

  const PAGE = 1000;
  const all: Array<Record<string, unknown>> = [];
  for (let from = 0; ; from += PAGE) {
    let rows = await runQuery(() =>
      sb.from(table).select(sel).order("id", { ascending: true }).range(from, from + PAGE - 1),
    );
    // 1ª página vazia pode ser leitura instável → tenta de novo uma vez.
    if (from === 0 && rows.length === 0) {
      await sleep(250);
      rows = await runQuery(() =>
        sb.from(table).select(sel).order("id", { ascending: true }).range(from, from + PAGE - 1),
      );
    }
    all.push(...rows);
    if (rows.length < PAGE) break;
  }
  return all;
}

// Executa fn sobre os itens com no máximo `limit` em paralelo (pool simples).
async function mapPool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  const worker = async () => {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

export async function loadSupabaseStore(): Promise<DataStore> {
  const sb = getSupabaseAdmin();
  const store = {} as Record<string, unknown[]>;
  const snap: Snapshot = {};

  // Lê as tabelas EM PARALELO (pool de 8) — bem mais rápido que sequencial.
  // (no-store já evita o cache do Next que antes zerava leituras concorrentes.)
  await mapPool(TABLES, 8, async (table) => {
    const rows = await readTable(sb, table);
    store[table] = rows;
    const map = new Map<string, string>();
    for (const row of rows) map.set(String(row.id), JSON.stringify(row));
    snap[table] = map;
  });

  const dataStore = store as unknown as DataStore;
  snapshots.set(dataStore, snap);
  return dataStore;
}

/**
 * Carrega APENAS as tabelas pedidas (as demais ficam vazias). Para telas de
 * leitura (Pedidos, Dashboard) que não precisam da base inteira — mais rápido
 * e confiável. Não registra snapshot (uso somente leitura, sem commit).
 */
export async function loadPartialSupabaseStore(
  tables: Array<keyof DataStore>,
): Promise<DataStore> {
  const sb = getSupabaseAdmin();
  const store = {} as Record<string, unknown[]>;
  for (const t of TABLES) store[t] = [];
  // Leituras EM PARALELO — como agora são no-store (sem o cache do Next que
  // antes zerava leituras), podem rodar juntas e a página abre muito mais rápido.
  await Promise.all(
    tables.map(async (t) => {
      store[t as string] = await readTable(sb, t as string);
    }),
  );
  return store as unknown as DataStore;
}

export async function commitSupabaseStore(store: DataStore): Promise<void> {
  const sb = getSupabaseAdmin();
  const snap = snapshots.get(store) ?? {};

  // 1) Upserts (linhas novas/alteradas) em ordem pai → filho.
  for (const table of TABLES) {
    const rows = (store[table] as unknown as Array<Record<string, unknown>>) ?? [];
    const previous = snap[table];
    const changed = rows.filter((row) => {
      const before = previous?.get(String(row.id));
      return before === undefined || before !== JSON.stringify(row);
    });
    if (changed.length > 0) {
      const { error } = await sb.from(table).upsert(changed);
      if (error) throw new Error(`Erro ao gravar "${table}": ${error.message}`);
    }
  }

  // 2) Deletes (linhas removidas) em ordem filho → pai.
  for (const table of [...TABLES].reverse()) {
    const previous = snap[table];
    if (!previous || previous.size === 0) continue;
    const rows = (store[table] as unknown as Array<Record<string, unknown>>) ?? [];
    const currentIds = new Set(rows.map((r) => String(r.id)));
    const removed = [...previous.keys()].filter((id) => !currentIds.has(id));
    if (removed.length > 0) {
      const { error } = await sb.from(table).delete().in("id", removed);
      if (error) throw new Error(`Erro ao remover de "${table}": ${error.message}`);
    }
  }
}

export interface CollectionRow {
  id: string;
  collected_at: string | null;
  carrier_name: string | null;
  collector_name: string | null;
  orders: { id: string; number: string }[];
  volumes: number;
}

/**
 * Histórico de coletas (Lotes de coleta) via consulta DIRECIONADA — lê só as
 * tabelas necessárias, sem carregar a base inteira (evita a leitura falhar).
 */
export async function fetchCollectionHistory(limit = 200): Promise<CollectionRow[]> {
  const sb = getSupabaseAdmin();

  const sel = async () => {
    const { data, error } = await sb
      .from("shipping_batches")
      .select("id,carrier_id,collector_name,collected_at")
      .order("collected_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(`Erro ao ler shipping_batches: ${error.message}`);
    return (data ?? []) as Array<Record<string, any>>;
  };
  let batches = await sel();
  if (batches.length === 0) {
    await sleep(250);
    batches = await sel();
  }
  if (batches.length === 0) return [];

  const batchIds = batches.map((b) => b.id);
  const { data: shipments } = await sb
    .from("shipments")
    .select("id,order_id,batch_id")
    .in("batch_id", batchIds);
  const shipRows = (shipments ?? []) as Array<Record<string, any>>;

  const orderIds = [...new Set(shipRows.map((s) => s.order_id).filter(Boolean))];
  const { data: orders } = orderIds.length
    ? await sb.from("orders").select("id,order_number").in("id", orderIds)
    : { data: [] as any[] };
  const orderRows = (orders ?? []) as Array<Record<string, any>>;

  const shipmentIds = shipRows.map((s) => s.id);
  const { data: vols } = shipmentIds.length
    ? await sb.from("shipment_volumes").select("id,shipment_id").in("shipment_id", shipmentIds)
    : { data: [] as any[] };
  const volRows = (vols ?? []) as Array<Record<string, any>>;

  const { data: carriers } = await sb.from("carriers").select("id,name");
  const carrierRows = (carriers ?? []) as Array<Record<string, any>>;

  return batches
    .map((b) => {
      const bShipments = shipRows.filter((s) => s.batch_id === b.id);
      const orders = bShipments
        .map((s) => {
          const o = orderRows.find((or) => or.id === s.order_id);
          return o ? { id: o.id as string, number: String(o.order_number) } : null;
        })
        .filter(Boolean) as { id: string; number: string }[];
      const volumes = bShipments.reduce(
        (sum, s) => sum + volRows.filter((v) => v.shipment_id === s.id).length,
        0,
      );
      return {
        id: b.id,
        collected_at: b.collected_at ?? null,
        carrier_name: carrierRows.find((c) => c.id === b.carrier_id)?.name ?? null,
        collector_name: b.collector_name ?? null,
        orders,
        volumes,
      };
    })
    // Retirada no CD não é coleta de transportadora → não aparece nos Lotes.
    .filter((row) => !/retir/i.test(row.carrier_name ?? ""));
}

/** Busca o JSON bruto de um pedido sob demanda (omitido das leituras em massa). */
export async function fetchOrderRawPayload(orderId: string): Promise<unknown> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("orders")
    .select("raw_payload")
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw new Error(`Erro ao ler raw_payload: ${error.message}`);
  return data?.raw_payload ?? null;
}

/** Lista eventos de webhook (com payload) para inspeção, mais recentes primeiro. */
export async function fetchRecentWebhookEvents(limit = 100, source?: string | null) {
  const sb = getSupabaseAdmin();
  let q = sb
    .from("webhook_events")
    .select("*")
    .order("received_at", { ascending: false })
    .limit(limit);
  if (source) q = q.eq("source", source);
  const { data, error } = await q;
  if (error) throw new Error(`Erro ao ler webhook_events: ${error.message}`);
  return data ?? [];
}
