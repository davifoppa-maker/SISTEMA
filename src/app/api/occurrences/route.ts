import { loadStore, commitStore } from "@/lib/db";
import { ok, fail } from "@/lib/api";
import { nowIso, uuid } from "@/lib/utils/ids";

export const dynamic = "force-dynamic";

// Categorias do Kanban de expedição. Guardadas no campo `severity` (que é TEXT
// livre no banco) — o `type` é um enum fixo, então não serve para categorias.
const CATEGORIAS = ["urgencia", "problema", "reclamacao"];

// POST /api/occurrences — cria um card livre no quadro (expedição).
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { categoria?: string; description?: string };
  const texto = (body.description ?? "").trim();
  if (!texto) return fail("Escreva a ocorrência.", 400);
  const categoria = CATEGORIAS.includes(body.categoria ?? "") ? body.categoria! : "problema";

  const store = await loadStore();
  const occ = {
    id: uuid(),
    order_id: null,
    shipment_id: null,
    carrier_id: null,
    type: "atraso", // valor válido do enum (não usado como categoria)
    severity: categoria, // a CATEGORIA do quadro vai aqui (campo texto livre)
    status: "aberta",
    description: texto,
    responsible_user_id: null,
    opened_at: nowIso(),
    resolved_at: null,
  };
  store.occurrences.push(occ as (typeof store.occurrences)[number]);
  await commitStore(store);
  return ok({ id: occ.id });
}
