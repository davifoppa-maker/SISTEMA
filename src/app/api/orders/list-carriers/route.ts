import { getSupabaseAdmin } from "@/lib/db/supabase-store";
import { ok, fail } from "@/lib/api";

export async function GET() {
  try {
    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from("carriers")
      .select("id, name")
      .order("name");

    if (error) return fail("Erro ao buscar transportadoras", 500, error);

    return ok({
      carriers: (data ?? []).map((c: any) => ({
        id: c.id,
        name: c.name,
      })),
    });
  } catch (err) {
    return fail("Erro ao listar transportadoras", 500, err instanceof Error ? err.message : err);
  }
}
