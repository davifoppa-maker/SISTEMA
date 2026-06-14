import { loadStore, commitStore } from "@/lib/db";
import { ok, fail } from "@/lib/api";
import { enrichExpeditionNFs } from "@/lib/services/tiny";
import { isTinyConnected } from "@/lib/services/tiny-api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Puxa as notas fiscais (número + chave) dos pedidos B2B em expedição.
export async function POST() {
  if (!(await isTinyConnected().catch(() => false))) {
    return fail("Olist Tiny não conectado.", 503);
  }
  const store = await loadStore();
  const enriched = await enrichExpeditionNFs(store, 50);
  await commitStore(store);
  return ok({ enriched });
}
