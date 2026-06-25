import { getSupabaseAdmin } from "@/lib/db/supabase-store";
import { ok, fail } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("stock_items")
    .select("*")
    .order("category")
    .order("name");
  if (error) return fail(error.message, 500);
  return ok(data);
}
