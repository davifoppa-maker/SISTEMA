import { getSupabaseAdmin } from "@/lib/db/supabase-store";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, Thead, Th, Tr, Td, EmptyState } from "@/components/ui/table";
import { brl } from "@/lib/utils/format";
import { StockValueClient } from "./stock-value-client";

export const dynamic = "force-dynamic";

const CATEGORY_LABELS: Record<string, string> = {
  aroma: "Aromas / Sabores",
  materia_prima: "Matéria-Prima",
  produto_nyer: "Produtos NYER",
  produto_lab: "Produtos LAB SKULL",
  embalagem: "Embalagem",
  rotulo: "Rótulos / Refis",
};

const CATEGORY_ORDER = [
  "aroma",
  "materia_prima",
  "produto_nyer",
  "produto_lab",
  "embalagem",
  "rotulo",
];

export interface StockValueItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  category: string;
  unit_cost: number | null;
}

export default async function StockValuePage() {
  const sb = getSupabaseAdmin();
  const { data: rows } = await sb
    .from("stock_items")
    .select("id, name, quantity, unit, category, unit_cost")
    .order("category")
    .order("name");

  const items: StockValueItem[] = (rows ?? []).map((r) => ({
    ...r,
    quantity: Number(r.quantity),
    unit_cost: r.unit_cost !== null ? Number(r.unit_cost) : null,
  }));

  // Summary
  const totalValue = items.reduce((sum, i) => {
    if (i.unit_cost === null) return sum;
    return sum + i.quantity * i.unit_cost;
  }, 0);

  const withCost = items.filter((i) => i.unit_cost !== null).length;
  const withoutCost = items.filter((i) => i.unit_cost === null).length;

  // Group by category
  const grouped: Record<string, StockValueItem[]> = {};
  for (const cat of CATEGORY_ORDER) {
    const catItems = items.filter((i) => i.category === cat);
    if (catItems.length > 0) grouped[cat] = catItems;
  }

  const categoryTotals: Record<string, number> = {};
  for (const [cat, catItems] of Object.entries(grouped)) {
    categoryTotals[cat] = catItems.reduce((sum, i) => {
      if (i.unit_cost === null) return sum;
      return sum + i.quantity * i.unit_cost;
    }, 0);
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title="Valor do estoque"
        description="Custo total dos itens em estoque"
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-slate-500">Valor total em estoque</div>
            <div className="mt-1 text-2xl font-bold text-slate-800">{brl(totalValue)}</div>
            <div className="text-xs text-slate-400">{withCost} itens com custo cadastrado</div>
          </CardContent>
        </Card>
        {withoutCost > 0 && (
          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-slate-500">Sem custo cadastrado</div>
              <div className="mt-1 text-2xl font-bold text-amber-600">{withoutCost}</div>
              <div className="text-xs text-slate-400">itens sem preço de custo</div>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-slate-500">Total de itens</div>
            <div className="mt-1 text-2xl font-bold text-slate-800">{items.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Per-category summary */}
      <Card>
        <CardHeader>
          <CardTitle>Valor por categoria</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <Thead>
              <Tr>
                <Th>Categoria</Th>
                <Th>Itens</Th>
                <Th>Valor total</Th>
              </Tr>
            </Thead>
            <tbody>
              {CATEGORY_ORDER.filter((c) => grouped[c]).map((cat) => (
                <Tr key={cat}>
                  <Td className="font-medium text-slate-800">{CATEGORY_LABELS[cat]}</Td>
                  <Td className="text-slate-500">{grouped[cat].length}</Td>
                  <Td className="font-semibold">{brl(categoryTotals[cat])}</Td>
                </Tr>
              ))}
              <Tr>
                <Td className="font-bold text-slate-800">Total</Td>
                <Td className="font-bold text-slate-800">{items.length}</Td>
                <Td className="font-bold text-slate-800">{brl(totalValue)}</Td>
              </Tr>
            </tbody>
          </Table>
        </CardContent>
      </Card>

      {/* Editable cost per item */}
      <StockValueClient items={items} />
    </div>
  );
}
