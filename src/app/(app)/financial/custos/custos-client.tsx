"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, Copy, ExternalLink, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, Thead, Th, Tr, Td, EmptyState } from "@/components/ui/table";
import { brl } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

export interface CustoLinha {
  nome: string;
  grupo: string;
  categoria: string;
  quantidade: number;
  unidade: "un" | "kg";
  custoUnit?: number;
  custoFonte?: "planilha" | "catalogo";
}

function parseCusto(s: string): number | null {
  const v = s.replace(/r\$/gi, "").replace(/\s+/g, "").replace(",", ".");
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function CustosClient({
  linhas,
  sheetUrl,
  custosTab,
}: {
  linhas: CustoLinha[];
  sheetUrl: string;
  custosTab: string;
}) {
  const [valores, setValores] = useState<Record<string, string>>(() =>
    Object.fromEntries(linhas.map((l) => [l.nome, l.custoUnit != null ? String(l.custoUnit) : ""])),
  );
  const [busca, setBusca] = useState("");
  const [soSemCusto, setSoSemCusto] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const termo = busca.trim().toLowerCase();

  const visiveis = useMemo(
    () =>
      linhas.filter((l) => {
        if (termo && !l.nome.toLowerCase().includes(termo)) return false;
        if (soSemCusto && parseCusto(valores[l.nome] ?? "") != null) return false;
        return true;
      }),
    [linhas, termo, soSemCusto, valores],
  );

  const totalValor = useMemo(
    () =>
      linhas.reduce((s, l) => {
        const c = parseCusto(valores[l.nome] ?? "");
        return s + (c != null ? c * l.quantidade : 0);
      }, 0),
    [linhas, valores],
  );

  const comCusto = linhas.filter((l) => parseCusto(valores[l.nome] ?? "") != null).length;

  function copiarParaPlanilha() {
    const linhasTxt = linhas
      .map((l) => ({ nome: l.nome, custo: parseCusto(valores[l.nome] ?? "") }))
      .filter((l) => l.custo != null)
      .map((l) => `${l.nome}\t${String(l.custo).replace(".", ",")}`);
    const texto = ["NOME\tCUSTO", ...linhasTxt].join("\n");
    navigator.clipboard.writeText(texto).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    });
  }

  return (
    <div className="space-y-5">
      {/* Como funciona */}
      <Card>
        <CardContent className="space-y-2 text-sm text-slate-600">
          <p className="font-medium text-slate-700">Como editar os custos</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Digite o custo unitário de cada produto abaixo. O valor do estoque atualiza na hora.</li>
            <li>
              Clique em <strong>Copiar para a planilha</strong> e cole (Ctrl/Cmd+V) na aba{" "}
              <strong>&quot;{custosTab}&quot;</strong> da planilha (colunas <strong>NOME</strong> e{" "}
              <strong>CUSTO</strong>). Se a aba ainda não existir, crie uma com esse nome.
            </li>
            <li>Pronto: o app passa a usar esses custos automaticamente em todos os relatórios.</li>
          </ol>
          <Link
            href={sheetUrl}
            target="_blank"
            className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline"
          >
            Abrir a planilha <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </CardContent>
      </Card>

      {/* Resumo + ações */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-slate-600">
          Valor estimado:{" "}
          <strong className="text-slate-800">{brl(totalValor)}</strong>{" "}
          <span className="text-slate-400">
            ({comCusto}/{linhas.length} itens com custo)
          </span>
        </div>
        <Button onClick={copiarParaPlanilha} variant={copiado ? "secondary" : "primary"}>
          {copiado ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
          {copiado ? "Copiado!" : "Copiar para a planilha"}
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Buscar produto..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-9"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={soSemCusto}
            onChange={(e) => setSoSemCusto(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          Só sem custo
        </label>
      </div>

      {/* Tabela editável */}
      <Card>
        <CardContent>
          {visiveis.length === 0 ? (
            <EmptyState message="Nenhum produto para esse filtro." />
          ) : (
            <Table>
              <Thead>
                <tr>
                  <Th>Produto</Th>
                  <Th className="text-right">Estoque</Th>
                  <Th className="w-40">Custo unit. (R$)</Th>
                  <Th className="text-right">Valor</Th>
                  <Th>Fonte</Th>
                </tr>
              </Thead>
              <tbody>
                {visiveis.map((l) => {
                  const raw = valores[l.nome] ?? "";
                  const custo = parseCusto(raw);
                  const valor = custo != null ? custo * l.quantidade : null;
                  return (
                    <Tr key={l.nome}>
                      <Td className="font-medium text-slate-700">
                        {l.nome}
                        <div className="text-[11px] font-normal text-slate-400">{l.grupo}</div>
                      </Td>
                      <Td className="text-right tabular-nums text-slate-600">
                        {l.quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} {l.unidade}
                      </Td>
                      <Td>
                        <Input
                          inputMode="decimal"
                          value={raw}
                          placeholder="0,00"
                          onChange={(e) =>
                            setValores((v) => ({ ...v, [l.nome]: e.target.value }))
                          }
                          className={cn("h-9", custo == null && raw !== "" && "border-red-400")}
                        />
                      </Td>
                      <Td className="text-right tabular-nums text-slate-700">
                        {valor != null ? brl(valor) : <span className="text-slate-300">—</span>}
                      </Td>
                      <Td>
                        {l.custoFonte === "planilha" ? (
                          <Badge variant="success">Planilha</Badge>
                        ) : l.custoFonte === "catalogo" ? (
                          <Badge variant="info">Catálogo</Badge>
                        ) : (
                          <Badge variant="muted">—</Badge>
                        )}
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
