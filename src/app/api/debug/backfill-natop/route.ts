import { ok, fail } from "@/lib/api";
import { loadStoreFor, commitStore } from "@/lib/db";
import { enrichOrderMetadata } from "@/lib/services/tiny";
import type { DataStore } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Preenche em massa a natureza de operação/marcadores de TODOS os pedidos
// pendentes, em lotes, até acabar ou estourar o tempo. Rode de novo se sobrar.
//   GET /api/debug/backfill-natop?k=exxdebug
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("k") !== "exxdebug") return fail("não autorizado", 403);

  const store = await loadStoreFor(["orders"] as Array<keyof DataStore>);
  const inicio = Date.now();
  let total = 0;
  let rodada = 0;
  // Para com folga antes do maxDuration (50s de 60s).
  while (Date.now() - inicio < 50_000) {
    const n = await enrichOrderMetadata(store, 40);
    total += n;
    rodada++;
    if (n === 0) break; // nada mais pendente (ou tudo falhou) — para
  }
  if (total > 0) await commitStore(store);

  const pendentes = store.orders.filter((o) => o.tiny_id && !(o as any).nat_operacao).length;
  return ok({ atualizados: total, rodadas: rodada, aindaPendentes: pendentes, dica: pendentes > 0 ? "Rode este link de novo para continuar." : "Concluído!" });
}
