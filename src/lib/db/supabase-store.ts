import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Helper de conexão com o Supabase para o modo de produção.
//
// O MVP opera com o store em memória (src/lib/db/memory-store.ts). Para produção:
//   1. Rode as migrations em supabase/migrations/0001_init.sql
//   2. Carregue supabase/seed.sql
//   3. Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY
//
// As tabelas do Postgres espelham os nomes de coleções de DataStore (snake_case),
// então a migração da camada de dados consiste em reimplementar getStore()/serviços
// usando este client (from("orders").select(...) etc.).

let client: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

export function getSupabaseAdmin(): SupabaseClient {
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Supabase não configurado. Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.",
    );
  }
  if (!client) {
    client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: { persistSession: false },
        // Toda leitura precisa ser sempre atual: o Next.js cacheia fetch() por
        // padrão; forçamos no-store para o estado nunca vir "congelado".
        global: {
          fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
        },
      },
    );
  }
  return client;
}
