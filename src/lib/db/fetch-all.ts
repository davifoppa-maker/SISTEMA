import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Busca TODAS as linhas de uma tabela paginando em PARALELO (o Supabase corta
 * em 1000 linhas por consulta). Antes, várias telas faziam isso em série — uma
 * consulta esperando a anterior terminar — o que multiplicava o tempo de rede
 * por página. Agora: 1 consulta de contagem + N consultas simultâneas.
 */
export async function fetchAllRows<T = Record<string, unknown>>(
  sb: SupabaseClient,
  table: string,
  columns: string,
  orderColumn = "id",
): Promise<T[]> {
  const PAGE = 1000;
  const { count } = await sb.from(table).select(columns, { count: "exact", head: true });
  const total = count ?? 0;
  if (total === 0) return [];

  const paginas: number[] = [];
  for (let from = 0; from < total; from += PAGE) paginas.push(from);

  const resultados = await Promise.all(
    paginas.map((from) =>
      sb.from(table).select(columns).order(orderColumn, { ascending: true }).range(from, from + PAGE - 1),
    ),
  );

  const linhas: T[] = [];
  for (const r of resultados) if (r.data) linhas.push(...(r.data as unknown as T[]));
  return linhas;
}
