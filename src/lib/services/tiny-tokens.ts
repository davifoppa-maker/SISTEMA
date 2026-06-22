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

// Mapeia companyId → provider key gravado no banco.
function toProvider(companyId = "nyer"): string {
  return companyId === "ecopro" ? "tiny_ecopro" : "tiny";
}

// Cache em memória (fallback de desenvolvimento). Singleton por processo.
const globalForTokens = globalThis as unknown as {
  __tinyTokens?: TinyTokenSet | null;
  __tinyEcoproTokens?: TinyTokenSet | null;
};

function fromEnv(companyId = "nyer"): TinyTokenSet | null {
  const prefix = companyId === "ecopro" ? "ECOPRO_" : "";
  const access = process.env[`${prefix}TINY_ACCESS_TOKEN`];
  if (!access) return null;
  return {
    access_token: access,
    refresh_token: process.env[`${prefix}TINY_REFRESH_TOKEN`] || null,
    expires_at: new Date(0).toISOString(),
    scope: null,
    obtained_at: new Date(0).toISOString(),
  };
}

function memKey(companyId = "nyer"): "__tinyTokens" | "__tinyEcoproTokens" {
  return companyId === "ecopro" ? "__tinyEcoproTokens" : "__tinyTokens";
}

export async function getStoredTokens(companyId = "nyer"): Promise<TinyTokenSet | null> {
  const provider = toProvider(companyId);
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("oauth_tokens")
      .select("access_token, refresh_token, expires_at, scope, obtained_at")
      .eq("provider", provider)
      .maybeSingle();
    if (error) throw new Error(`Falha ao ler tokens do Supabase: ${error.message}`);
    if (data) return data as TinyTokenSet;
    return fromEnv(companyId);
  }
  const key = memKey(companyId);
  if (globalForTokens[key] !== undefined && globalForTokens[key] !== null) {
    return globalForTokens[key]!;
  }
  return fromEnv(companyId);
}

export async function saveTokens(tokens: TinyTokenSet, companyId = "nyer"): Promise<void> {
  const provider = toProvider(companyId);
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from("oauth_tokens")
      .upsert({ provider, ...tokens, updated_at: new Date().toISOString() }, {
        onConflict: "provider",
      });
    if (error) throw new Error(`Falha ao salvar tokens no Supabase: ${error.message}`);
    return;
  }
  globalForTokens[memKey(companyId)] = tokens;
}

export async function clearTokens(companyId = "nyer"): Promise<void> {
  const provider = toProvider(companyId);
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseAdmin();
    await supabase.from("oauth_tokens").delete().eq("provider", provider);
    return;
  }
  globalForTokens[memKey(companyId)] = null;
}
