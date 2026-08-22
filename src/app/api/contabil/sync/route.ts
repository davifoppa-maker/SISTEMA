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
  const { data: existentes } = await sb.from("fiscal_notes").select("id, tipo, data").in("id", ids);
  // Linhas VAZIAS (parser antigo: data null e não-stub) voltam para a fila.
  const jaTem = new Set((existentes ?? []).filter((e: any) => e.tipo === "sem_xml" || e.data).map((e: any) => e.id));
  const faltantes = notas.filter((n) => !jaTem.has(`${empresa}:${n.id}`));

  // 3) Baixa e parseia o XML de até 35 notas por rodada (retomável).
  const lote = faltantes.slice(0, 35);
  const linhas: Record<string, unknown>[] = [];
  let errosXml = 0;
  for (const n of lote) {
    try {
      const rx = await tinyFetch(`${c.apiBaseUrl}/notas/${n.id}/xml`, {}, empresa);
      const bruto = await rx.text();
      // Decodificador UNIVERSAL: o XML pode vir cru, embrulhado em JSON
      // ({data:{xml}} — inclusive em base64), com entidades HTML (&lt;) ou
      // escapes unicode (\u003c). Normaliza tudo até sobrar XML de verdade.
      const decodifica = (t: string): string => {
        let x = t;
        for (let passo = 0; passo < 4; passo++) {
          if (x.includes("<ICMSTot>") || x.includes("<infNFe")) {
            if (x.includes("<dhEmi>") || x.includes("<nNF>") || x.includes("<vNF>")) return x;
          }
          // JSON com campo xml em qualquer nível?
          try {
            const j = JSON.parse(x);
            const acha = (o: any, prof: number): string | null => {
              if (typeof o === "string" && (o.includes("<infNFe") || o.includes("&lt;infNFe") || /^[A-Za-z0-9+/=\s]{200,}$/.test(o))) return o;
              if (o && typeof o === "object" && prof < 4) {
                for (const v of Object.values(o)) { const r2 = acha(v, prof + 1); if (r2) return r2; }
              }
              return null;
            };
            const dentro = acha(j, 0);
            if (dentro) { x = dentro; continue; }
          } catch { /* não é JSON */ }
          // Entidades HTML?
          if (x.includes("&lt;")) { x = x.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&"); continue; }
          // Escapes unicode?
          if (x.includes("\\u003c")) { x = x.replace(/\\u003c/gi, "<").replace(/\\u003e/gi, ">").replace(/\\u0026/gi, "&"); continue; }
          // Base64 de XML?
          if (/^[A-Za-z0-9+/=\s]{200,}$/.test(x.trim())) {
            try {
              const dec = Buffer.from(x.trim(), "base64").toString("utf-8");
              if (dec.includes("<")) { x = dec; continue; }
            } catch { /* não é base64 */ }
          }
          break;
        }
        return x;
      };
      const xml = decodifica(bruto);
      if (!xml || (!xml.includes("<vNF>") && !xml.includes("<nNF>") && !xml.includes("<dhEmi>"))) {
        // Sem XML (nota não autorizada / rascunho / cancelada): grava um stub
        // para NÃO ficar tentando para sempre — fica fora da apuração.
        errosXml++;
        linhas.push({
          id: `${empresa}:${n.id}`, empresa, tipo: "sem_xml", numero: n.numero ?? null,
          serie: null, chave: null, data: `${mes}-01`, cliente: null,
          valor: 0, vprod: 0, vicms: 0, vpis: 0, vcofins: 0, vipi: 0,
          situacao: `sem XML (${String(n.situacao ?? "?")})`,
        });
        await pausa(150);
        continue;
      }
      const tpNF = tag(xml, "tpNF"); // 0 = entrada · 1 = saída
      const tot = xml.slice(xml.indexOf("<ICMSTot>"), xml.indexOf("</ICMSTot>") + 10);
      linhas.push({
        id: `${empresa}:${n.id}`,
        empresa,
        tipo: tpNF === "0" ? "entrada" : "saida",
        numero: tag(xml, "nNF") ?? n.numero ?? null,
        serie: tag(xml, "serie"),
        chave: (xml.match(/Id="NFe(\d{44})"/) ?? [])[1] ?? null,
        data: (tag(xml, "dhEmi") ?? tag(xml, "dEmi") ?? "").slice(0, 10) || `${mes}-01`,
        cliente: (xml.split("<dest>")[1]?.match(/<xNome>([^<]*)<\/xNome>/) ?? [])[1] ?? tag(xml, "xNome"),
        valor: num(tag(tot, "vNF")),
        vprod: num(tag(tot, "vProd")),
        vicms: num(tag(tot, "vICMS")),
        vpis: num(tag(tot, "vPIS")),
        vcofins: num(tag(tot, "vCOFINS")),
        vipi: num(tag(tot, "vIPI")),
        situacao: String(n.situacao ?? ""),
      });
    } catch {
      errosXml++;
      linhas.push({
        id: `${empresa}:${n.id}`, empresa, tipo: "sem_xml", numero: n.numero ?? null,
        serie: null, chave: null, data: `${mes}-01`, cliente: null,
        valor: 0, vprod: 0, vicms: 0, vpis: 0, vcofins: 0, vipi: 0,
        situacao: "erro ao baixar XML",
      });
    }
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
    pendentes: Math.max(0, faltantes.length - lote.length),
  });
}
