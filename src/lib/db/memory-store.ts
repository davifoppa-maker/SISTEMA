import type { DataStore } from "@/lib/types";
import { buildSeedStore } from "@/lib/db/seed";

// Store em memória (driver de simulação). É um singleton por processo Node, de
// modo que Route Handlers e Server Components compartilham o mesmo estado durante
// a execução do servidor de desenvolvimento.
//
// Em produção, troque o driver por Supabase (ver supabase/migrations + seed.sql e
// src/lib/db/supabase-store.ts). A interface pública usada pelo app é getStore().

const globalForStore = globalThis as unknown as { __nyerStore?: DataStore };

export function getStore(): DataStore {
  if (!globalForStore.__nyerStore) {
    globalForStore.__nyerStore = buildSeedStore();
  }
  return globalForStore.__nyerStore;
}

/** Reinicia o store para o seed inicial (útil em testes). */
export function resetStore(): DataStore {
  globalForStore.__nyerStore = buildSeedStore();
  return globalForStore.__nyerStore;
}
