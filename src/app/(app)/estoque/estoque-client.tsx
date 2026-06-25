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
import type { EstoqueReport, EstoqueItem } from "@/lib/services/estoque";

type Aba = "materia_prima" | "produto_acabado";

function fmtQtd(item: EstoqueItem): string {
  const n = item.quantidade;
  const s = Number.isInteger(n) ? n.toLocaleString("pt-BR") : n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  const unit = item.categoria === "materia_prima" ? "kg" : "un";
  return `${s} ${unit}`;
}

function Kpi({
  icon: Icon,
  label,
  value,
  tone = "slate",
  onClick,
  active,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone?: "slate" | "brand" | "amber" | "emerald" | "red";
  onClick?: () => void;
  active?: boolean;
}) {
  const tones: Record<string, string> = {
    slate: "bg-slate-100 text-slate-600",
    brand: "bg-brand-50 text-brand-700",
    amber: "bg-amber-100 text-amber-700",
    emerald: "bg-emerald-100 text-emerald-700",
    red: "bg-red-100 text-red-700",
  };
  return (
    <Card
      className={cn(onClick && "cursor-pointer transition-shadow hover:shadow-md", active && "ring-2 ring-brand-400")}
      onClick={onClick}
    >
      <CardContent className="flex items-center gap-3">
        <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", tones[tone])}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="text-xs text-slate-500">{label}</div>
          <div className="truncate text-lg font-semibold text-slate-800">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

export function EstoqueClient({ report }: { report: EstoqueReport }) {
  const [aba, setAba] = useState<Aba>("materia_prima");
  const [busca, setBusca] = useState("");
  const [limite, setLimite] = useState(10);

  const termo = busca.trim().toLowerCase();

  const gruposVisiveis = useMemo(() => {
    return report.grupos
      .filter((g) => g.categoria === aba)
      .map((g) => ({
        ...g,
        itens: g.itens.filter((i) => !termo || i.nome.toLowerCase().includes(termo)),
      }))
      .filter((g) => g.itens.length > 0);
  }, [report.grupos, aba, termo]);

  const itensAba = useMemo(
    () => report.itens.filter((i) => i.categoria === aba),
    [report.itens, aba],
  );
  const zerados = useMemo(() => itensAba.filter((i) => i.quantidade === 0), [itensAba]);
  const baixos = useMemo(
    () => itensAba.filter((i) => i.quantidade > 0 && i.quantidade <= limite),
    [itensAba, limite],
  );

  const r = report.resumo;
  const unidadeAba = aba === "materia_prima" ? "kg" : "un";

  const totalAba = aba === "materia_prima" ? r.materiaPrimaKg : r.produtoAcabadoUnidades;
  const zeradosTotal = report.itens.filter((i) => i.quantidade === 0).length;

  return (
    <div className="space-y-6">
      {/* Abas principais */}
      <div className="flex gap-2 border-b border-slate-200">
        <button
          onClick={() => { setAba("materia_prima"); setBusca(""); }}
          className={cn(
            "flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors",
            aba === "materia_prima"
              ? "border-emerald-500 text-emerald-700"
              : "border-transparent text-slate-500 hover:text-slate-800",
          )}
        >
          <Beaker className="h-4 w-4" />
          Matéria-prima
          <span className={cn(
            "rounded-full px-1.5 py-0.5 text-xs",
            aba === "materia_prima" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500",
          )}>
            {report.itens.filter((i) => i.categoria === "materia_prima").length}
          </span>
        </button>
        <button
          onClick={() => { setAba("produto_acabado"); setBusca(""); }}
          className={cn(
            "flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors",
            aba === "produto_acabado"
              ? "border-brand-500 text-brand-700"
              : "border-transparent text-slate-500 hover:text-slate-800",
          )}
        >
          <Package className="h-4 w-4" />
          Produtos acabados
          <span className={cn(
            "rounded-full px-1.5 py-0.5 text-xs",
            aba === "produto_acabado" ? "bg-brand-50 text-brand-700" : "bg-slate-100 text-slate-500",
          )}>
            {report.itens.filter((i) => i.categoria === "produto_acabado").length}
          </span>
        </button>
      </div>

      {/* KPIs da aba */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi
          icon={Boxes}
          label="Total de itens"
          value={itensAba.length.toLocaleString("pt-BR")}
          tone="slate"
        />
        <Kpi
          icon={aba === "materia_prima" ? Beaker : Package}
          label={aba === "materia_prima" ? "Total em kg" : "Total em unidades"}
          value={`${totalAba.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ${unidadeAba}`}
          tone={aba === "materia_prima" ? "emerald" : "brand"}
        />
        <Kpi
          icon={AlertTriangle}
          label="Zerados"
          value={zerados.length.toLocaleString("pt-BR")}
          tone={zerados.length > 0 ? "red" : "slate"}
        />
        <Kpi
          icon={AlertTriangle}
          label={`Estoque baixo (≤ ${limite})`}
          value={baixos.length.toLocaleString("pt-BR")}
          tone={baixos.length > 0 ? "amber" : "slate"}
        />
      </div>

      {/* Alertas */}
      {(zerados.length > 0 || baixos.length > 0) && (
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
                <span className="text-slate-400">{unidadeAba}</span>
              </label>
            </div>

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
                        <Badge variant="danger">0 {unidadeAba}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-amber-600">
                  Estoque baixo (≤ {limite} {unidadeAba}) — {baixos.length}
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
          </CardContent>
        </Card>
      )}

      {/* Busca */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          placeholder={`Buscar ${aba === "materia_prima" ? "matéria-prima" : "produto acabado"}...`}
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Tabelas por grupo */}
      {gruposVisiveis.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState message="Nenhum item encontrado." />
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
                    {unidadeAba}
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
      </p>
    </div>
  );
}
