import Link from "next/link";
import { ArrowLeft, ExternalLink, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { getEstoqueReport, EstoqueIndisponivelError } from "@/lib/services/estoque";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/db/supabase-store";
import { CustosClient, type CustoLinha } from "./custos-client";

export const dynamic = "force-dynamic";

export default async function CustosPage() {
  let linhas: CustoLinha[] = [];
  let sheetUrl = "";
  let custosTab = "custos";
  let erro: string | null = null;
  let savedCustos: Record<string, number> = {};

  // Carrega custos salvos no Supabase
  if (isSupabaseConfigured()) {
    try {
      const sb = getSupabaseAdmin();
      const { data } = await sb.from("estoque_custos").select("nome, custo");
      for (const row of data ?? []) savedCustos[row.nome] = row.custo;
    } catch { /* ignora se tabela não existe ainda */ }
  }

  try {
    const report = await getEstoqueReport();
    sheetUrl = report.sheetUrl;
    custosTab = report.custosTab;
    linhas = report.itens.map((i) => ({
      nome: i.nome,
      grupo: i.grupo,
      categoria: i.categoria,
      quantidade: i.quantidade,
      unidade: i.unidade,
      custoUnit: savedCustos[i.nome] ?? i.custoUnit,
      custoFonte: savedCustos[i.nome] != null ? "salvo" : i.custoFonte,
    }));
  } catch (e) {
    erro =
      e instanceof EstoqueIndisponivelError
        ? e.message
        : `Falha inesperada ao ler o estoque: ${(e as Error).message}`;
  }

  return (
    <>
      <PageHeader
        title="Custos do estoque"
        description="Defina o custo unitário de cada produto para estimar o valor do estoque."
      >
        <Link
          href="/financial"
          className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar ao financeiro
        </Link>
      </PageHeader>

      {erro ? (
        <Card>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-red-700">
              <RefreshCw className="h-4 w-4" />
              Não foi possível carregar os produtos
            </div>
            <p className="text-sm text-slate-600">{erro}</p>
            <Link
              href={`https://docs.google.com/spreadsheets/d/${process.env.ESTOQUE_SHEET_ID || "1Q3PaZbBrCmq_MeXGdnnIOVf3JmwJXrqpAUx92qNWNto"}/edit`}
              target="_blank"
              className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline"
            >
              Abrir a planilha <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </CardContent>
        </Card>
      ) : (
        <CustosClient linhas={linhas} sheetUrl={sheetUrl} custosTab={custosTab} />
      )}
    </>
  );
}
