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
  // Último dia REAL do mês (mes-31 quebra em meses de 30 dias/fevereiro).
  const ultimoDia = new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0).getDate();
  const { data, error } = await sb
    .from("fiscal_notes")
    .select("*")
    .eq("empresa", "nyer") // apuração só da NRX (lucro real)
    .gte("data", `${mes}-01`)
    .lte("data", `${mes}-${String(ultimoDia).padStart(2, "0")}`)
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
