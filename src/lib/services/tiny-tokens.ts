// Persistência dos tokens OAuth do Olist Tiny.
//
// Em produção (Vercel + serverless) a memória do processo é descartada entre
// requisições, então os tokens PRECISAM ser persistidos fora do processo. Quando
// o Supabase está configurado, gravamos na tabela `oauth_tokens`
// (ver supabase/migrations/0002_oauth_tokens.sql). Sem Supabase, caímos para:
//   1. um cache em memória (válido só durante o processo), e
//   2. as variáveis TINY_ACCESS_TOKEN / TINY_REFRESH_TOKEN do ambiente (seed),
// úteis em desenvolvimento local.

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/db/supabase-store";

export interface TinyTokenSet {
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null; // ISO
  scope: string | null;
  obtained_at: string; // ISO
}

const PROVIDER = "tiny";

// Cache em memória (fallback de desenvolvimento). Singleton por processo.
const globalForTokens = globalThis as unknown as { __tinyTokens?: TinyTokenSet | null };

function fromEnv(): TinyTokenSet | null {
  const access = process.env.TINY_ACCESS_TOKEN;
  if (!access) return null;
  return {
    access_token: access,
    refresh_token: process.env.TINY_REFRESH_TOKEN || null,
    // Sem validade conhecida: trata como expirado para forçar refresh no 1º uso.
    expires_at: new Date(0).toISOString(),
    scope: null,
    obtained_at: new Date(0).toISOString(),
  };
}

export async function getStoredTokens(): Promise<TinyTokenSet | null> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("oauth_tokens")
      .select("access_token, refresh_token, expires_at, scope, obtained_at")
      .eq("provider", PROVIDER)
      .maybeSingle();
    if (error) throw new Error(`Falha ao ler tokens do Supabase: ${error.message}`);
    if (data) return data as TinyTokenSet;
    // Sem registro ainda: tenta semear do ambiente.
    return fromEnv();
  }
  if (globalForTokens.__tinyTokens !== undefined && globalForTokens.__tinyTokens !== null) {
    return globalForTokens.__tinyTokens;
  }
  return fromEnv();
}

export async function saveTokens(tokens: TinyTokenSet): Promise<void> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from("oauth_tokens")
      .upsert({ provider: PROVIDER, ...tokens, updated_at: new Date().toISOString() }, {
        onConflict: "provider",
      });
    if (error) throw new Error(`Falha ao salvar tokens no Supabase: ${error.message}`);
    return;
  }
  globalForTokens.__tinyTokens = tokens;
}

export async function clearTokens(): Promise<void> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseAdmin();
    await supabase.from("oauth_tokens").delete().eq("provider", PROVIDER);
    return;
  }
  globalForTokens.__tinyTokens = null;
}
