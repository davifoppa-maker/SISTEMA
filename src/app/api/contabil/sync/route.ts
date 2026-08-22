import { ok, fail } from "@/lib/api";
import { getSupabaseAdmin } from "@/lib/db/supabase-store";
import { getTinyConfig, tinyFetch } from "@/lib/services/tiny-api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// SYNC CONTÁBIL: lista as notas fiscais do mês no Olist, baixa o XML de cada
// uma e grava os impostos (ICMS/PIS/COFINS do bloco ICMSTot) na tabela
// fiscal_notes. Em LOTES (retomável): rode de novo até pendentes=0.
//   POST /api/contabil/sync?mes=2026-08&empresa=nyer
//
// Requer a tabela (rodar 1x no Supabase → SQL):
//   CREATE TABLE IF NOT EXISTS fiscal_notes (
//     id text PRIMARY KEY, empresa text, tipo text, numero text, serie text,
//     chave text, data date, cliente text, valor numeric, vprod numeric,
//     vicms numeric, vpis numeric, vcofins numeric, vipi numeric,
//     situacao text, created_at timestamptz DEFAULT now()
//   );

const num = (s: string | null) => (s == null ? 0 : Number(s) || 0);
const tag = (xml: string, t: string): string | null => {
  const m = xml.match(new RegExp(`<${t}>([^<]*)</${t}>`));
  return m ? m[1] : null;
};

export async function POST(req: Request) {
  const u = new URL(req.url);
  const mes = u.searchParams.get("mes") || new Date().toISOString().slice(0, 7);
  const empresa = u.searchParams.get("empresa") || "nyer";
  const c = getTinyConfig(empresa);
  const sb = getSupabaseAdmin();
  const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const dataInicial = `${mes}-01`;
  const fim = new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0).getDate();
  const dataFinal = `${mes}-${String(fim).padStart(2, "0")}`;

  // 1) Lista as notas do período (paginado).
  const notas: { id: string; numero?: string; situacao?: unknown }[] = [];
  for (let offset = 0; offset < 600; offset += 100) {
    const r = await tinyFetch(`${c.apiBaseUrl}/notas?dataInicial=${dataInicial}&dataFinal=${dataFinal}&limit=100&offset=${offset}`, {}, empresa).catch(() => null);
    const j = r ? await r.json().catch(() => null) as any : null;
    const itens = (j?.itens ?? j?.data ?? []) as any[];
    if (!Array.isArray(itens) || itens.length === 0) break;
    for (const n of itens) if (n?.id) notas.push({ id: String(n.id), numero: n.numero, situacao: n.situacao });
    if (itens.length < 100) break;
    await pausa(150);
  }
  if (notas.length === 0) return ok({ mes, empresa, listadas: 0, gravadas: 0, pendentes: 0, aviso: "Nenhuma nota no período (ou o endpoint /notas não aceitou os filtros)." });

  // 2) Quais já temos gravadas?
  const ids = notas.map((n) => `${empresa}:${n.id}`);
  const { data: existentes } = await sb.from("fiscal_notes").select("id").in("id", ids);
  const jaTem = new Set((existentes ?? []).map((e: any) => e.id));
  const faltantes = notas.filter((n) => !jaTem.has(`${empresa}:${n.id}`));

  // 3) Baixa e parseia o XML de até 35 notas por rodada (retomável).
  const lote = faltantes.slice(0, 35);
  const linhas: Record<string, unknown>[] = [];
  let errosXml = 0;
  for (const n of lote) {
    try {
      const rx = await tinyFetch(`${c.apiBaseUrl}/notas/${n.id}/xml`, {}, empresa);
      const bruto = await rx.text();
      // O XML pode vir cru ou embrulhado em JSON { data: { xml: "..." } }.
      let xml = bruto;
      if (!bruto.includes("<NFe") && !bruto.includes("<nfeProc")) {
        try { const j = JSON.parse(bruto); xml = j?.data?.xml ?? j?.xml ?? ""; } catch { xml = ""; }
      }
      if (!xml || (!xml.includes("<ICMSTot>") && !xml.includes("<infNFe"))) { errosXml++; await pausa(150); continue; }
      const tpNF = tag(xml, "tpNF"); // 0 = entrada · 1 = saída
      const tot = xml.slice(xml.indexOf("<ICMSTot>"), xml.indexOf("</ICMSTot>") + 10);
      linhas.push({
        id: `${empresa}:${n.id}`,
        empresa,
        tipo: tpNF === "0" ? "entrada" : "saida",
        numero: tag(xml, "nNF") ?? n.numero ?? null,
        serie: tag(xml, "serie"),
        chave: (xml.match(/Id="NFe(\d{44})"/) ?? [])[1] ?? null,
        data: (tag(xml, "dhEmi") ?? "").slice(0, 10) || null,
        cliente: (xml.split("<dest>")[1]?.match(/<xNome>([^<]*)<\/xNome>/) ?? [])[1] ?? tag(xml, "xNome"),
        valor: num(tag(tot, "vNF")),
        vprod: num(tag(tot, "vProd")),
        vicms: num(tag(tot, "vICMS")),
        vpis: num(tag(tot, "vPIS")),
        vcofins: num(tag(tot, "vCOFINS")),
        vipi: num(tag(tot, "vIPI")),
        situacao: String(n.situacao ?? ""),
      });
    } catch { errosXml++; }
    await pausa(200);
  }

  if (linhas.length > 0) {
    const { error } = await sb.from("fiscal_notes").upsert(linhas, { onConflict: "id" });
    if (error) return fail(`Erro ao gravar (a tabela fiscal_notes existe? Rode o SQL do cabeçalho): ${error.message}`, 500);
  }

  return ok({
    mes, empresa,
    listadas: notas.length,
    jaGravadas: jaTem.size,
    gravadasAgora: linhas.length,
    errosXml,
    pendentes: Math.max(0, faltantes.length - lote.length) + errosXml,
  });
}
