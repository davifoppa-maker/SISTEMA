import { dataDriver, loadStore } from "@/lib/db";
import { fetchRecentWebhookEvents } from "@/lib/db/supabase-data";
import { ok } from "@/lib/api";

export const dynamic = "force-dynamic";

// Lista payloads brutos recebidos para diagnóstico de integração (com payload).
export async function GET(req: Request) {
  const source = new URL(req.url).searchParams.get("source");
  if (dataDriver === "supabase") {
    return ok(await fetchRecentWebhookEvents(100, source));
  }
  const store = await loadStore();
  let events = [...store.webhook_events].sort((a, b) =>
    a.received_at < b.received_at ? 1 : -1,
  );
  if (source) events = events.filter((e) => e.source === source);
  return ok(events.slice(0, 100));
}
