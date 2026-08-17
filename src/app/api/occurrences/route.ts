import { getSupabaseAdmin } from "@/lib/db/supabase-store";
import { ok, fail } from "@/lib/api";
import { nowIso } from "@/lib/utils/ids";

export const dynamic = "force-dynamic";

// Categorias do Kanban de expedição. Guardadas no campo `severity` (TEXT livre);
// o `type` é enum fixo no banco, então usamos um valor válido do enum.
const CATEGORIAS = ["urgencia", "problema", "reclamacao"];

// POST /api/occurrences — cria um card no quadro (insert direto, sem full-store).
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { categoria?: string; description?: string };
  const texto = (body.description ?? "").trim();
  if (!texto) return fail("Escreva a ocorrência.", 400);
  const categoria = CATEGORIAS.includes(body.categoria ?? "") ? body.categoria! : "problema";

  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("occurrences")
    .insert({
      type: "atraso", // valor válido do enum (não usado como categoria)
      severity: categoria, // a CATEGORIA do quadro (campo texto livre)
      status: "aberta",
      description: texto,
      opened_at: nowIso(),
    })
    .select("id")
    .single();

  if (error) return fail(`Erro ao salvar: ${error.message}`, 500);
  return ok({ id: data?.id }, 201);
}
