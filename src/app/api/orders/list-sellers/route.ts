import { getSupabaseAdmin } from "@/lib/db/supabase-store";
import { ok, fail } from "@/lib/api";

export async function GET() {
  try {
    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from("sellers")
      .select("id, name, email")
      .order("name");

    if (error) return fail("Erro ao buscar vendedores", 500, error);

    return ok({
      sellers: (data ?? []).map((s: any) => ({
        id: s.id,
        name: s.name,
        email: s.email,
      })),
    });
  } catch (err) {
    return fail("Erro ao listar vendedores", 500, err instanceof Error ? err.message : err);
  }
}
