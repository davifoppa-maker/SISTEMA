import { loadStore, commitStore } from "@/lib/db";
import { ok, fail } from "@/lib/api";

export const dynamic = "force-dynamic";

// Edita uma transportadora (SLA padrão em dias úteis, rastreio, instruções, ativo).
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const store = await loadStore();
  const carrier = store.carriers.find((c) => c.id === params.id);
  if (!carrier) return fail("Transportadora não encontrada", 404);

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (typeof body.default_sla_days === "number" && body.default_sla_days >= 0) {
    carrier.default_sla_days = Math.round(body.default_sla_days);
  }
  if (typeof body.tracking_url_template === "string") {
    carrier.tracking_url_template = body.tracking_url_template.trim() || null;
  }
  if (typeof body.portal_instructions === "string") {
    carrier.portal_instructions = body.portal_instructions.trim() || null;
  }
  if (typeof body.active === "boolean") carrier.active = body.active;

  await commitStore(store);
  return ok(carrier);
}
