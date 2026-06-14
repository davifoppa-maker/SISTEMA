import { loadStore, commitStore } from "@/lib/db";
import { ok, fail } from "@/lib/api";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const store = await loadStore();
  const rule = store.channel_detection_rules.find((r) => r.id === params.id);
  if (!rule) return fail("Regra não encontrada", 404);
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (typeof body.active === "boolean") rule.active = body.active;
  if (typeof body.priority === "number") rule.priority = body.priority;
  await commitStore(store);
  return ok(rule);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const store = await loadStore();
  const idx = store.channel_detection_rules.findIndex((r) => r.id === params.id);
  if (idx === -1) return fail("Regra não encontrada", 404);
  store.channel_detection_rules.splice(idx, 1);
  await commitStore(store);
  return ok({ deleted: true });
}
