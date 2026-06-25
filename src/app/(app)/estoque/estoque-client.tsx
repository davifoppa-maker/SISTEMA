"use client";

import { useMemo, useState } from "react";
import {
  Boxes,
  Package,
  Beaker,
  AlertTriangle,
  Search,
} from "lucide-react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, Thead, Th, Tr, Td, EmptyState } from "@/components/ui/table";
import { dateTime } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import type { EstoqueReport, EstoqueItem, Categoria } from "@/lib/services/estoque";

type Filtro = "todos" | "produto_acabado" | "materia_prima";

function fmtQtd(item: EstoqueItem): string {
  const n = item.quantidade;
  const s = Number.isInteger(n) ? n.toLocaleString("pt-BR") : n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  const unit = item.categoria === "materia_prima" ? "kg" : (item.unidade === "kg" ? "kg" : "un");
  return `${s} ${unit}`;
}

function Kpi({
  icon: Icon,
  label,
  value,
  sub,
  tone = "slate",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  tone?: "slate" | "brand" | "amber" | "emerald" | "red";
}) {
  const tones: Record<string, string> = {
    slate: "bg-slate-100 text-slate-600",
    brand: "bg-brand-50 text-brand-700",
    amber: "bg-amber-100 text-amber-700",
    emerald: "bg-emerald-100 text-emerald-700",
    red: "bg-red-100 text-red-700",
  };
  return (
    <Card>
      <CardContent className="flex items-center gap-3">
        <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", tones[tone])}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="text-xs text-slate-500">{label}</div>
          <div className="truncate text-lg font-semibold text-slate-800">{value}</div>
          {sub ? <div className="text-[11px] text-slate-400">{sub}</div> : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function EstoqueClient({ report }: { report: EstoqueReport }) {
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [busca, setBusca] = useState("");
  const [limite, setLimite] = useState(10);

  const termo = busca.trim().toLowerCase();

  const gruposVisiveis = useMemo(() => {
    return report.grupos
      .filter((g) => filtro === "todos" || g.categoria === filtro)
      .map((g) => ({
        ...g,
        itens: g.itens.filter((i) => !termo || i.nome.toLowerCase().includes(termo)),
      }))
      .filter((g) => g.itens.length > 0);
  }, [report.grupos, filtro, termo]);

  const zerados = useMemo(() => report.itens.filter((i) => i.quantidade === 0), [report.itens]);
  const baixos = useMemo(
    () => report.itens.filter((i) => i.quantidade > 0 && i.quantidade <= limite),
    [report.itens, limite],
  );

  const r = report.resumo;

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi icon={Boxes} label="Itens no estoque" value={r.totalItens.toLocaleString("pt-BR")} tone="slate" />
        <Kpi
          icon={Package}
          label="Produto acabado"
          value={`${r.produtoAcabadoUnidades.toLocaleString("pt-BR")} un`}
          tone="brand"
        />
        <Kpi
          icon={Beaker}
          label="Matéria-prima"
          value={`${r.materiaPrimaKg.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg`}
          tone="emerald"
        />
        <Kpi
          icon={AlertTriangle}
          label="Itens zerados"
          value={r.itensZerados.toLocaleString("pt-BR")}
          tone={r.itensZerados > 0 ? "red" : "slate"}
        />
      </div>

      {/* Alertas */}
      <Card>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              Alertas de reposição
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-500">
              Estoque baixo: ≤
              <Input
                type="number"
                value={limite}
                min={0}
                onChange={(e) => setLimite(Math.max(0, Number(e.target.value) || 0))}
                className="h-8 w-20"
              />
            </label>
          </div>

          {zerados.length === 0 && baixos.length === 0 ? (
            <p className="text-sm text-emerald-700">Nenhum item zerado ou abaixo do limite. 👍</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-red-600">
                  Zerados ({zerados.length})
                </div>
                {zerados.length === 0 ? (
                  <p className="text-xs text-slate-400">Nenhum.</p>
                ) : (
                  <ul className="space-y-1">
                    {zerados.map((i, idx) => (
                      <li key={idx} className="flex items-center justify-between gap-2 text-sm">
                        <span className="truncate text-slate-700">{i.nome}</span>
                        <Badge variant="danger">0 {i.unidade}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-amber-600">
                  Estoque baixo (≤ {limite}) — {baixos.length}
                </div>
                {baixos.length === 0 ? (
                  <p className="text-xs text-slate-400">Nenhum.</p>
                ) : (
                  <ul className="space-y-1">
                    {baixos
                      .slice()
                      .sort((a, b) => a.quantidade - b.quantidade)
                      .map((i, idx) => (
                        <li key={idx} className="flex items-center justify-between gap-2 text-sm">
                          <span className="truncate text-slate-700">{i.nome}</span>
                          <Badge variant="warning">{fmtQtd(i)}</Badge>
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-slate-200 bg-white p-1">
          {(
            [
              ["todos", "Todos"],
              ["produto_acabado", "Produto acabado"],
              ["materia_prima", "Matéria-prima"],
            ] as [Filtro, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setFiltro(id)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                filtro === id ? "bg-brand-50 text-brand-700" : "text-slate-500 hover:text-slate-800",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Buscar item..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Tabelas por grupo */}
      {gruposVisiveis.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState message="Nenhum item encontrado para esse filtro/busca." />
          </CardContent>
        </Card>
      ) : (
        gruposVisiveis.map((g) => (
          <Card key={`${g.categoria}-${g.grupo}`}>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                  {g.categoria === "materia_prima" ? (
                    <Beaker className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <Package className="h-4 w-4 text-brand-700" />
                  )}
                  {g.grupo}
                  <Badge variant="muted">{g.itens.length}</Badge>
                </div>
                <div className="text-xs text-slate-500">
                  Total:{" "}
                  <strong>
                    {g.totalQtd.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}{" "}
                    {g.categoria === "materia_prima" ? "kg" : "un"}
                  </strong>
                </div>
              </div>
              <Table>
                <Thead>
                  <tr>
                    <Th>Item</Th>
                    <Th className="text-right">Quantidade</Th>
                  </tr>
                </Thead>
                <tbody>
                  {g.itens.map((i, idx) => {
                    const alerta = i.quantidade === 0 ? "danger" : i.quantidade <= limite ? "warning" : null;
                    return (
                      <Tr key={idx}>
                        <Td className="font-medium text-slate-700">{i.nome}</Td>
                        <Td className="text-right">
                          {alerta ? (
                            <Badge variant={alerta}>{fmtQtd(i)}</Badge>
                          ) : (
                            <span className="tabular-nums">{fmtQtd(i)}</span>
                          )}
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

      {/* Rodapé */}
      <p className="text-xs text-slate-400">
        Lido ao vivo em {dateTime(report.fetchedAt)} ·{" "}
        <Link href={report.sheetUrl} target="_blank" className="text-brand-700 hover:underline">
          abrir planilha
        </Link>
        . Valor estimado a custo (apenas produtos acabados NYER com custo cadastrado); refis,
        embalagens, rótulos e itens LAB SKULL não entram no valor.
      </p>
    </div>
  );
}
