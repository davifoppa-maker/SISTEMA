import { loadStore } from "@/lib/db";
import { ok } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  const store = await loadStore();
  return ok(store.message_templates);
}
