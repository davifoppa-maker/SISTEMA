import { loadStore, commitStore } from "@/lib/db";
import { ok, fail } from "@/lib/api";

export const dynamic = "force-dynamic";

// Descarta uma mensagem da fila de aprovação (remove sem enviar).
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { id?: string };
  if (!body.id) return fail("id é obrigatório", 400);

  const store = await loadStore();
  const idx = store.message_logs.findIndex((m) => m.id === body.id && m.status === "queued");
  if (idx === -1) return fail("Mensagem não encontrada na fila", 404);
  store.message_logs.splice(idx, 1);
  await commitStore(store);
  return ok({ discarded: true });
}
