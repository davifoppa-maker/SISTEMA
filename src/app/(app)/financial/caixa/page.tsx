import { getSupabaseAdmin } from "@/lib/db/supabase-store";
import { CaixaClient } from "./caixa-client";

export const dynamic = "force-dynamic";

export default async function CaixaPage() {
  const sb = getSupabaseAdmin();
  const { data: accounts } = await sb
    .from("cash_accounts")
    .select("*")
    .order("company")
    .order("sort_order");

  return <CaixaClient accounts={accounts ?? []} />;
}
