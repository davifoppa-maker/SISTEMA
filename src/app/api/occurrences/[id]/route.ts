import { loadStore, commitStore } from "@/lib/db";
import { ok, fail } from "@/lib/api";
import { nowIso } from "@/lib/utils/ids";

export const dynamic = "force-dynamic";

// Atualiza o status de uma ocorrência (ex.: resolver) ou remove-a (?delete=1).
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const body = (await req.json().catch(() => ({}))) as { status?: string };
  const store = await loadStore();
  const occ = store.occurrences.find((o) => o.id === params.id);
  if (!occ) return fail("Ocorrência não encontrada", 404);

  const status = body.status === "aberta" || body.status === "em_andamento" || body.status === "resolvida"
    ? body.status
    : "resolvida";
  occ.status = status;
  occ.resolved_at = status === "resolvida" ? nowIso() : null;

  // Resolve também o alerta interno ligado a essa expedição, se houver.
  if (status === "resolvida") {
    for (const a of store.alerts) {
      if (a.shipment_id && a.shipment_id === occ.shipment_id && !a.resolved) a.resolved = true;
    }
  }

  await commitStore(store);
  return ok({ id: occ.id, status: occ.status });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const store = await loadStore();
  const idx = store.occurrences.findIndex((o) => o.id === params.id);
  if (idx === -1) return fail("Ocorrência não encontrada", 404);
  store.occurrences.splice(idx, 1);
  await commitStore(store);
  return ok({ deleted: true });
}
