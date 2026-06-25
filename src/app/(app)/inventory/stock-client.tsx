"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, Thead, Th, Tr, Td, EmptyState } from "@/components/ui/table";
import { cn } from "@/lib/utils/cn";
import { dateShort } from "@/lib/utils/format";
import type { StockItem } from "./page";

const CATEGORY_LABELS: Record<string, string> = {
  aroma: "Aromas / Sabores",
  materia_prima: "Matéria-Prima",
  produto_nyer: "Produtos NYER",
  produto_lab: "Produtos LAB SKULL",
  embalagem: "Embalagem",
  rotulo: "Rótulos / Refis",
};

// Página 1: Matéria Prima | Página 2: Produto Acabado
const PAGE_TABS = [
  { key: "materia_prima_page", label: "Matéria Prima" },
  { key: "produto_acabado_page", label: "Produto Acabado" },
];

const MATERIA_PRIMA_CATS = ["aroma", "materia_prima"];
const PRODUTO_ACABADO_CATS = ["produto_nyer", "produto_lab", "embalagem", "rotulo"];

const SUB_TABS: Record<string, { key: string; label: string }[]> = {
  materia_prima_page: [
    { key: "all", label: "Todos" },
    { key: "aroma", label: "Aromas" },
    { key: "materia_prima", label: "Matéria-Prima" },
  ],
  produto_acabado_page: [
    { key: "all", label: "Todos" },
    { key: "produto_nyer", label: "Prod. NYER" },
    { key: "produto_lab", label: "Prod. LAB" },
    { key: "embalagem", label: "Embalagem" },
    { key: "rotulo", label: "Rótulo" },
  ],
};

function formatQty(item: StockItem): string {
  const n = Number(item.quantity);
  if (item.unit === "KG") {
    return `${n % 1 === 0 ? n.toFixed(0) : n} kg`;
  }
  return String(n % 1 === 0 ? Math.round(n) : n);
}

function qtyClass(item: StockItem): string {
  const qty = Number(item.quantity);
  if (qty === 0) return "text-red-600 font-bold";
  if (item.min_stock !== null && qty <= Number(item.min_stock))
    return "text-amber-600 font-semibold";
  return "";
}

interface EditState {
  id: string;
  field: "quantity" | "min_stock";
  value: string;
}

export function StockClient({ items: initial }: { items: StockItem[] }) {
  const [items, setItems] = useState<StockItem[]>(initial);
  const [search, setSearch] = useState("");
  const [activePage, setActivePage] = useState("materia_prima_page");
  const [activeSubCat, setActiveSubCat] = useState("all");
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [edit, setEdit] = useState<EditState | null>(null);

  const totalItems = items.length;
  const zeroItems = items.filter((i) => Number(i.quantity) === 0).length;

  const pageCats = activePage === "materia_prima_page" ? MATERIA_PRIMA_CATS : PRODUTO_ACABADO_CATS;

  const filtered = items.filter((item) => {
    const inPage = pageCats.includes(item.category);
    const matchCat = activeSubCat === "all" || item.category === activeSubCat;
    const matchSearch = !search || item.name.toLowerCase().includes(search.toLowerCase());
    return inPage && matchCat && matchSearch;
  });

  const categoryOrder = activePage === "materia_prima_page"
    ? MATERIA_PRIMA_CATS
    : PRODUTO_ACABADO_CATS;

  const grouped: Record<string, StockItem[]> = {};
  for (const cat of categoryOrder) {
    const catItems = filtered.filter((i) => i.category === cat);
    if (catItems.length > 0) grouped[cat] = catItems;
  }

  async function saveField(item: StockItem, field: "quantity" | "min_stock", value: string) {
    const key = `${item.id}-${field}`;
    setSaving((prev) => new Set(prev).add(key));
    try {
      const res = await fetch(`/api/stock/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      const json = await res.json();
      if (json.ok && json.data) {
        setItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, ...json.data } : i)),
        );
      }
    } finally {
      setSaving((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  function startEdit(item: StockItem, field: "quantity" | "min_stock") {
    const val =
      field === "quantity"
        ? String(Number(item.quantity))
        : item.min_stock !== null
          ? String(Number(item.min_stock))
          : "";
    setEdit({ id: item.id, field, value: val });
  }

  function commitEdit(item: StockItem) {
    if (!edit || edit.id !== item.id) return;
    saveField(item, edit.field, edit.value);
    setEdit(null);
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Summary badges */}
      <div className="flex flex-wrap gap-3">
        <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-600">
          <span className="font-semibold text-slate-800">{totalItems}</span> itens cadastrados
        </span>
        {zeroItems > 0 && (
          <span className="rounded-full bg-red-50 px-3 py-1 text-sm text-red-700">
            <span className="font-bold">{zeroItems}</span> sem estoque
          </span>
        )}
      </div>

      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar item…"
        className="w-full max-w-sm rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-700 focus:outline-none"
      />

      {/* Page tabs (Matéria Prima / Produto Acabado) */}
      <div className="flex gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 w-fit">
        {PAGE_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => { setActivePage(tab.key); setActiveSubCat("all"); }}
            className={cn(
              "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
              activePage === tab.key
                ? "bg-white text-slate-800 shadow-sm"
                : "text-slate-500 hover:text-slate-700",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Sub-category pills */}
      <div className="flex flex-wrap gap-2">
        {SUB_TABS[activePage].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveSubCat(tab.key)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              activeSubCat === tab.key
                ? "bg-brand-700 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tables per category */}
      {Object.keys(grouped).length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState message="Nenhum item encontrado." />
          </CardContent>
        </Card>
      ) : (
        Object.entries(grouped).map(([cat, catItems]) => (
          <Card key={cat}>
            <CardHeader>
              <CardTitle>{CATEGORY_LABELS[cat] ?? cat}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <Thead>
                  <Tr>
                    <Th>Nome</Th>
                    <Th>Qtd</Th>
                    <Th>Unid.</Th>
                    <Th>Estoque Mín</Th>
                    <Th>Atualizado</Th>
                  </Tr>
                </Thead>
                <tbody>
                  {catItems.map((item) => {
                    const isEditingQty =
                      edit?.id === item.id && edit.field === "quantity";
                    const isEditingMin =
                      edit?.id === item.id && edit.field === "min_stock";
                    const isSavingQty = saving.has(`${item.id}-quantity`);
                    const isSavingMin = saving.has(`${item.id}-min_stock`);

                    return (
                      <Tr key={item.id}>
                        <Td className="font-medium text-slate-800">{item.name}</Td>

                        {/* Quantity cell */}
                        <Td>
                          {isEditingQty ? (
                            <input
                              autoFocus
                              type="number"
                              value={edit.value}
                              onChange={(e) =>
                                setEdit((prev) =>
                                  prev ? { ...prev, value: e.target.value } : prev,
                                )
                              }
                              onBlur={() => commitEdit(item)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") commitEdit(item);
                                if (e.key === "Escape") setEdit(null);
                              }}
                              className="w-24 rounded border border-brand-300 px-2 py-0.5 text-sm focus:outline-none"
                            />
                          ) : (
                            <button
                              onClick={() => startEdit(item, "quantity")}
                              disabled={isSavingQty}
                              className={cn(
                                "rounded px-1 hover:bg-slate-100 focus:outline-none",
                                qtyClass(item),
                                isSavingQty && "opacity-50",
                              )}
                              title="Clique para editar"
                            >
                              {isSavingQty ? "…" : formatQty(item)}
                            </button>
                          )}
                        </Td>

                        <Td className="text-slate-500">{item.unit}</Td>

                        {/* Min stock cell */}
                        <Td>
                          {isEditingMin ? (
                            <input
                              autoFocus
                              type="number"
                              value={edit.value}
                              onChange={(e) =>
                                setEdit((prev) =>
                                  prev ? { ...prev, value: e.target.value } : prev,
                                )
                              }
                              onBlur={() => commitEdit(item)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") commitEdit(item);
                                if (e.key === "Escape") setEdit(null);
                              }}
                              className="w-24 rounded border border-brand-300 px-2 py-0.5 text-sm focus:outline-none"
                            />
                          ) : (
                            <button
                              onClick={() => startEdit(item, "min_stock")}
                              disabled={isSavingMin}
                              className={cn(
                                "rounded px-1 text-slate-500 hover:bg-slate-100 focus:outline-none",
                                isSavingMin && "opacity-50",
                              )}
                              title="Clique para editar estoque mínimo"
                            >
                              {isSavingMin
                                ? "…"
                                : item.min_stock !== null
                                  ? item.unit === "KG"
                                    ? `${Number(item.min_stock)} kg`
                                    : String(Number(item.min_stock))
                                  : "—"}
                            </button>
                          )}
                        </Td>

                        <Td className="text-slate-500 text-xs">
                          {dateShort(item.updated_at)}
                        </Td>
                      </Tr>
                    );
                  })}
                </tbody>
              </Table>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
