import { getSupabaseAdmin } from "@/lib/db/supabase-store";
import { ok, fail } from "@/lib/api";

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  const body = await req.json().catch(() => null);
  if (!body) return fail("Corpo inválido", 400);

  const allowed: Record<string, unknown> = {};
  if (body.quantity !== undefined) allowed.quantity = Number(body.quantity);
  if (body.min_stock !== undefined)
    allowed.min_stock =
      body.min_stock === "" || body.min_stock === null
        ? null
        : Number(body.min_stock);
  if (body.notes !== undefined) allowed.notes = body.notes;
  if (body.unit_cost !== undefined)
    allowed.unit_cost =
      body.unit_cost === "" || body.unit_cost === null
        ? null
        : Number(body.unit_cost);
  allowed.updated_at = new Date().toISOString();

  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("stock_items")
    .update(allowed)
    .eq("id", params.id)
    .select()
    .single();
  if (error) return fail(error.message, 500);
  return ok(data);
}
