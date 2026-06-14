import { getStore as getMemoryStore, resetStore } from "@/lib/db/memory-store";
import { isSupabaseConfigured } from "@/lib/db/supabase-store";
import { loadSupabaseStore, loadPartialSupabaseStore, commitSupabaseStore } from "@/lib/db/supabase-data";
import type { DataStore } from "@/lib/types";

export const dataDriver: "memory" | "supabase" =
  process.env.DATA_DRIVER === "supabase" || isSupabaseConfigured()
    ? "supabase"
    : "memory";

/**
 * Carrega o estado da aplicação.
 *   • memory: devolve o singleton em memória (simulação/dev/testes).
 *   • supabase: lê o estado completo do Postgres.
 * Rotas e Server Components devem usar `await loadStore()`.
 */
export async function loadStore(): Promise<DataStore> {
  if (dataDriver === "supabase") return loadSupabaseStore();
  return getMemoryStore();
}

/**
 * Carrega só as tabelas indicadas (telas de leitura). Em memória, devolve o
 * store completo (sem custo). Em supabase, lê apenas o necessário.
 */
export async function loadStoreFor(tables: Array<keyof DataStore>): Promise<DataStore> {
  if (dataDriver === "supabase") return loadPartialSupabaseStore(tables);
  return getMemoryStore();
}

/**
 * Persiste as alterações feitas no store.
 *   • memory: no-op (as mutações já estão no singleton).
 *   • supabase: grava no Postgres apenas o que mudou.
 * Chame após qualquer rota que altere dados.
 */
export async function commitStore(store: DataStore): Promise<void> {
  if (dataDriver === "supabase") await commitSupabaseStore(store);
}

// getStore (síncrono, memória) permanece disponível para testes/dev.
export { getMemoryStore as getStore, resetStore };
