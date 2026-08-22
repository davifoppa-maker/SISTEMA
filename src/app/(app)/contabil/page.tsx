import { PageHeader } from "@/components/page-header";
import { getSupabaseAdmin } from "@/lib/db/supabase-store";
import { ContabilClient, type NotaFiscal } from "./contabil-client";

export const dynamic = "force-dynamic";

// ABA CONTÁBIL: notas de ENTRADA × SAÍDA do mês com ICMS/PIS/COFINS extraídos
// do XML (bloco ICMSTot) → apuração: débito (saída) − crédito (entrada).
export default async function ContabilPage({ searchParams }: { searchParams: { mes?: string } }) {
  const mes = searchParams.mes || new Date().toISOString().slice(0, 7);
  const sb = getSupabaseAdmin();
  let notas: NotaFiscal[] = [];
  let erroTabela: string | null = null;
  const { data, error } = await sb
    .from("fiscal_notes")
    .select("*")
    .gte("data", `${mes}-01`)
    .lte("data", `${mes}-31`)
    .order("data", { ascending: false });
  if (error) erroTabela = error.message;
  else notas = (data ?? []) as NotaFiscal[];

  return (
    <>
      <PageHeader
        title="📚 Contábil"
        description="Notas de entrada × saída com ICMS, PIS e COFINS do XML — apuração do mês (débito − crédito)."
      />
      <ContabilClient mes={mes} notas={notas} erroTabela={erroTabela} />
    </>
  );
}
