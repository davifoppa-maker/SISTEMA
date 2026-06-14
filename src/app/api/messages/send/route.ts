import { loadStore, commitStore } from "@/lib/db";
import { ok, parseBody } from "@/lib/api";
import { sendMessageSchema } from "@/lib/validation/schemas";
import { sendMessage } from "@/lib/services/whatsapp";

// Envio manual autorizado por usuário (modo mock no MVP).
export async function POST(req: Request) {
  const parsed = await parseBody(req, sendMessageSchema);
  if (!parsed.ok) return parsed.response;
  const store = await loadStore();
  const log = await sendMessage(store, parsed.data);
  await commitStore(store);
  return ok(log);
}
