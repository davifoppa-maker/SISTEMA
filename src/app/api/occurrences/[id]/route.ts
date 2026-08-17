import { getSupabaseAdmin } from "@/lib/db/supabase-store";
import { ok, fail } from "@/lib/api";
import { nowIso } from "@/lib/utils/ids";

export const dynamic = "force-dynamic";

const CATEGORIAS = ["urgencia", "problema", "reclamacao"];

// PATCH /api/occurrences/[id] — move de coluna: muda a categoria (severity) e/ou
// o status (resolvido). Update direto no Supabase.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const body = (await req.json().catch(() => ({}))) as { status?: string; categoria?: string };
  const patch: Record<string, unknown> = {};

  if (body.categoria && CATEGORIAS.includes(body.categoria)) {
    patch.severity = body.categoria;
    if (!body.status) { patch.status = "aberta"; patch.resolved_at = null; }
  }
  if (body.status === "aberta" || body.status === "em_andamento" || body.status === "resolvida") {
    patch.status = body.status;
    patch.resolved_at = body.status === "resolvida" ? nowIso() : null;
  }
  if (Object.keys(patch).length === 0) return fail("Nada para atualizar.", 400);

  const sb = getSupabaseAdmin();
  const { error } = await sb.from("occurrences").update(patch).eq("id", params.id);
  if (error) return fail(`Erro ao atualizar: ${error.message}`, 500);
  return ok({ id: params.id, ...patch });
}

// DELETE /api/occurrences/[id]
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const sb = getSupabaseAdmin();
  const { error } = await sb.from("occurrences").delete().eq("id", params.id);
  if (error) return fail(`Erro ao remover: ${error.message}`, 500);
  return ok({ deleted: true });
}
