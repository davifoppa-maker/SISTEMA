"use client";

// AutoSync DESLIGADO temporariamente. Ele disparava sync a cada 30s em toda aba
// e sobrecarregava Tiny/Supabase (site fora do ar). A sincronização agora é feita
// pelo CRON diário (keep-alive) e pelos BOTÕES "Atualizar pedidos"/"Importar do
// Olist". Sem nenhuma chamada automática no carregamento.
export function AutoSync() {
  return null;
}
