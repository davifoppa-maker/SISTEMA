import { getSupabaseAdmin } from "@/lib/db/supabase-store";
import { PageHeader } from "@/components/page-header";
import { StockClient } from "./stock-client";

export const dynamic = "force-dynamic";

export interface StockItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  category: string;
  min_stock: number | null;
  notes: string | null;
  updated_at: string;
  created_at: string;
}

export default async function InventoryPage() {
  const sb = getSupabaseAdmin();
  const { data } = await sb
    .from("stock_items")
    .select("*")
    .order("category")
    .order("name");

  const items: StockItem[] = data ?? [];

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader title="Estoque" description="Controle de itens em estoque" />
      <StockClient items={items} />
    </div>
  );
}
