"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, Thead, Th, Tr, Td } from "@/components/ui/table";
import { brl } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import type { StockValueItem } from "./page";

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

interface EditState {
  id: string;
  value: string;
}

export function StockValueClient({ items: initial }: { items: StockValueItem[] }) {
  const [items, setItems] = useState<StockValueItem[]>(initial);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [saving, setSaving] = useState<Set<string>>(new Set());

  const grouped: Record<string, StockValueItem[]> = {};
  for (const cat of CATEGORY_ORDER) {
    const catItems = items.filter((i) => i.category === cat);
    if (catItems.length > 0) grouped[cat] = catItems;
  }

  async function saveCost(item: StockValueItem, value: string) {
    setSaving((prev) => new Set(prev).add(item.id));
    try {
      const res = await fetch(`/api/stock/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unit_cost: value === "" ? null : value }),
      });
      const json = await res.json();
      if (json.ok && json.data) {
        setItems((prev) =>
          prev.map((i) =>
            i.id === item.id
              ? { ...i, unit_cost: json.data.unit_cost !== null ? Number(json.data.unit_cost) : null }
              : i,
          ),
        );
      }
    } finally {
      setSaving((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  }

  function commit(item: StockValueItem) {
    if (!edit || edit.id !== item.id) return;
    saveCost(item, edit.value);
    setEdit(null);
  }

  return (
    <div className="flex flex-col gap-6">
      {Object.entries(grouped).map(([cat, catItems]) => (
        <Card key={cat}>
          <CardHeader>
            <CardTitle>{CATEGORY_LABELS[cat] ?? cat}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <Thead>
                <Tr>
                  <Th>Item</Th>
                  <Th>Qtd</Th>
                  <Th>Unid.</Th>
                  <Th>Custo unitário</Th>
                  <Th>Valor total</Th>
                </Tr>
              </Thead>
              <tbody>
                {catItems.map((item) => {
                  const isEditing = edit?.id === item.id;
                  const isSaving = saving.has(item.id);
                  const totalValue =
                    item.unit_cost !== null ? item.quantity * item.unit_cost : null;

                  return (
                    <Tr key={item.id}>
                      <Td className="font-medium text-slate-800">{item.name}</Td>
                      <Td className="text-slate-600">
                        {item.unit === "KG"
                          ? `${Number(item.quantity) % 1 === 0 ? Math.round(Number(item.quantity)) : Number(item.quantity)} kg`
                          : Math.round(Number(item.quantity))}
                      </Td>
                      <Td className="text-slate-500">{item.unit}</Td>
                      <Td>
                        {isEditing ? (
                          <input
                            autoFocus
                            type="number"
                            step="0.01"
                            value={edit.value}
                            onChange={(e) =>
                              setEdit((prev) =>
                                prev ? { ...prev, value: e.target.value } : prev,
                              )
                            }
                            onBlur={() => commit(item)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commit(item);
                              if (e.key === "Escape") setEdit(null);
                            }}
                            className="w-28 rounded border border-brand-300 px-2 py-0.5 text-sm focus:outline-none"
                          />
                        ) : (
                          <button
                            onClick={() =>
                              setEdit({
                                id: item.id,
                                value: item.unit_cost !== null ? String(item.unit_cost) : "",
                              })
                            }
                            disabled={isSaving}
                            className={cn(
                              "rounded px-1 text-sm hover:bg-slate-100 focus:outline-none",
                              item.unit_cost === null ? "text-slate-400 italic" : "text-slate-700",
                              isSaving && "opacity-50",
                            )}
                            title="Clique para editar custo"
                          >
                            {isSaving
                              ? "…"
                              : item.unit_cost !== null
                                ? brl(item.unit_cost)
                                : "Informar custo"}
                          </button>
                        )}
                      </Td>
                      <Td className="font-semibold">
                        {totalValue !== null ? (
                          <span className="text-slate-800">{brl(totalValue)}</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
