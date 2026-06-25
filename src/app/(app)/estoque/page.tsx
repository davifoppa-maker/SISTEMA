import Link from "next/link";
import { DollarSign, ExternalLink, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { getEstoqueReport, EstoqueIndisponivelError } from "@/lib/services/estoque";
import { EstoqueClient } from "./estoque-client";
import { RefreshButton } from "./refresh-button";

export const dynamic = "force-dynamic";

export default async function EstoquePage() {
  let report;
  let erro: string | null = null;
  try {
    report = await getEstoqueReport();
  } catch (e) {
    if (e instanceof EstoqueIndisponivelError) {
      erro = e.message;
    } else {
      erro = `Falha inesperada ao ler o estoque: ${(e as Error).message}`;
    }
  }

  return (
    <>
      <PageHeader
        title="Estoque"
        description="Relatórios do estoque lidos ao vivo da planilha BALANCO ESTOQUE (Google Drive)."
      >
        <Link
          href="/estoque/custos"
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <DollarSign className="h-4 w-4" /> Editar custos
        </Link>
        <RefreshButton />
      </PageHeader>

      {erro || !report ? (
        <Card>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-red-700">
              <RefreshCw className="h-4 w-4" />
              Não foi possível carregar o estoque
            </div>
            <p className="text-sm text-slate-600">{erro}</p>
            <p className="text-xs text-slate-500">
              Para o app ler a planilha, ela precisa estar compartilhada como{" "}
              <strong>&quot;Qualquer pessoa com o link&quot;</strong> (Leitor). Abra a planilha no
              Google Drive → botão <strong>Compartilhar</strong> → em &quot;Acesso geral&quot;,
              escolha <strong>Qualquer pessoa com o link</strong>.
            </p>
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
        <EstoqueClient report={report} />
      )}
    </>
  );
}
