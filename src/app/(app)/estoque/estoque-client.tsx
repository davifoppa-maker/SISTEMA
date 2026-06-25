"use client";

import { useMemo, useState } from "react";
import { Package, Beaker, AlertTriangle, Search, BoxesIcon } from "lucide-react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, Thead, Th, Tr, Td, EmptyState } from "@/components/ui/table";
import { dateTime } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import type { EstoqueReport, EstoqueItem, Categoria } from "@/lib/services/estoque";

type Aba = "materia_prima" | "produto_acabado" | "embalagens";

const ABAS: { id: Aba; label: string; icon: React.ComponentType<{ className?: string }>; cor: string; ringCor: string; unidade: string }[] = [
  { id: "materia_prima",  label: "Matéria-prima",    icon: Beaker,    cor: "border-emerald-500 text-emerald-700", ringCor: "bg-emerald-100 text-emerald-700", unidade: "kg" },
  { id: "produto_acabado", label: "Produto acabado", icon: Package,   cor: "border-brand-500 text-brand-700",     ringCor: "bg-brand-50 text-brand-700",      unidade: "un" },
  { id: "embalagens",     label: "Embalagens",       icon: BoxesIcon, cor: "border-amber-500 text-amber-700",     ringCor: "bg-amber-100 text-amber-700",     unidade: "un" },
];

function fmtQtd(item: EstoqueItem): string {
  const n = item.quantidade;
  const s = Number.isInteger(n) ? n.toLocaleString("pt-BR") : n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  const unit = item.categoria === "materia_prima" ? "kg" : "un";
  return `${s} ${unit}`;
}

export function EstoqueClient({ report }: { report: EstoqueReport }) {
  const [aba, setAba] = useState<Aba>("materia_prima");
  const [busca, setBusca] = useState("");
  const [limite, setLimite] = useState(10);

  const termo = busca.trim().toLowerCase();
  const abaConfig = ABAS.find((a) => a.id === aba)!;

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

  const contagem = (cat: Categoria) => report.itens.filter((i) => i.categoria === cat).length;

  return (
    <div className="space-y-6">
      {/* Abas */}
      <div className="flex gap-0 border-b border-slate-200">
        {ABAS.map(({ id, label, icon: Icon, cor, ringCor }) => {
          const ativo = aba === id;
          return (
            <button
              key={id}
              onClick={() => { setAba(id); setBusca(""); }}
              className={cn(
                "flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors",
                ativo ? cor : "border-transparent text-slate-500 hover:text-slate-800",
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
              <span className={cn("rounded-full px-1.5 py-0.5 text-xs", ativo ? ringCor : "bg-slate-100 text-slate-500")}>
                {contagem(id)}
              </span>
            </button>
          );
        })}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <abaConfig.icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs text-slate-500">Total de itens</div>
              <div className="text-lg font-semibold text-slate-800">{itensAba.length.toLocaleString("pt-BR")}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <abaConfig.icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs text-slate-500">Quantidade total</div>
              <div className="text-lg font-semibold text-slate-800">
                {itensAba.reduce((s, i) => s + i.quantidade, 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} {abaConfig.unidade}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3">
            <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", zerados.length > 0 ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600")}>
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs text-slate-500">Zerados</div>
              <div className="text-lg font-semibold text-slate-800">{zerados.length}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3">
            <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", baixos.length > 0 ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600")}>
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs text-slate-500">Estoque baixo (≤ {limite})</div>
              <div className="text-lg font-semibold text-slate-800">{baixos.length}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Alertas */}
      {(zerados.length > 0 || baixos.length > 0) && (
        <Card>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                Alertas de reposição — {abaConfig.label}
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
                <span className="text-slate-400">{abaConfig.unidade}</span>
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
                        <Badge variant="danger">0 {abaConfig.unidade}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-amber-600">
                  Baixo (≤ {limite} {abaConfig.unidade}) — {baixos.length}
                </div>
                {baixos.length === 0 ? (
                  <p className="text-xs text-slate-400">Nenhum.</p>
                ) : (
                  <ul className="space-y-1">
                    {baixos.slice().sort((a, b) => a.quantidade - b.quantidade).map((i, idx) => (
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
          placeholder={`Buscar em ${abaConfig.label.toLowerCase()}...`}
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Tabelas */}
      {gruposVisiveis.length === 0 ? (
        <Card><CardContent><EmptyState message="Nenhum item encontrado." /></CardContent></Card>
      ) : (
        gruposVisiveis.map((g) => (
          <Card key={`${g.categoria}-${g.grupo}`}>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <abaConfig.icon className="h-4 w-4" />
                  {g.grupo}
                  <Badge variant="muted">{g.itens.length}</Badge>
                </div>
                <div className="text-xs text-slate-500">
                  Total: <strong>{g.totalQtd.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} {abaConfig.unidade}</strong>
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

      <p className="text-xs text-slate-400">
        Lido ao vivo em {dateTime(report.fetchedAt)} ·{" "}
        <Link href={report.sheetUrl} target="_blank" className="text-brand-700 hover:underline">
          abrir planilha
        </Link>
      </p>
    </div>
  );
}
