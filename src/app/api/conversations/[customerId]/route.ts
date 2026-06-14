import { loadStore } from "@/lib/db";
import { ok } from "@/lib/api";

// Histórico de conversa de um cliente (entrada/saída).
export async function GET(_req: Request, { params }: { params: { customerId: string } }) {
  const store = await loadStore();
  const messages = store.message_logs
    .filter((m) => m.customer_id === params.customerId)
    .sort((a, b) => ((a.created_at ?? "") < (b.created_at ?? "") ? -1 : 1));
  return ok(messages);
}
