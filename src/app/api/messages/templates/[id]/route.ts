import { loadStore, commitStore } from "@/lib/db";
import { ok, fail } from "@/lib/api";

export const dynamic = "force-dynamic";

// Edita um template de mensagem (texto e ativo/inativo).
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const store = await loadStore();
  const tpl = store.message_templates.find((t) => t.id === params.id);
  if (!tpl) return fail("Template não encontrado", 404);

  const body = (await req.json().catch(() => ({}))) as { body?: string; name?: string; active?: boolean };
  if (typeof body.body === "string") tpl.body = body.body;
  if (typeof body.name === "string" && body.name.trim()) tpl.name = body.name.trim();
  if (typeof body.active === "boolean") tpl.active = body.active;

  await commitStore(store);
  return ok(tpl);
}
