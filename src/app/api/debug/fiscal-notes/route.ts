import { getSupabaseAdmin } from "@/lib/db/supabase-store";

export const dynamic = "force-dynamic";

// Raio-X da tabela fiscal_notes: quantas linhas existem, como estão os campos
// data/tipo (os filtros da página dependem deles) e uma amostra crua.
//   GET /api/debug/fiscal-notes?k=exxdebug
export async function GET(req: Request) {
  const u = new URL(req.url);
  if (u.searchParams.get("k") !== "exxdebug") {
    return Response.json({ ok: false, error: "não autorizado" }, { status: 403 });
  }
  const sb = getSupabaseAdmin();
  const { count: total } = await sb.from("fiscal_notes").select("*", { count: "exact", head: true });
  const { count: semData } = await sb.from("fiscal_notes").select("*", { count: "exact", head: true }).is("data", null);
  const { data: amostra, error } = await sb
    .from("fiscal_notes")
    .select("id, empresa, tipo, numero, data, valor, vicms, situacao")
    .limit(8);
  const { data: tipos } = await sb.from("fiscal_notes").select("tipo");
  const porTipo: Record<string, number> = {};
  for (const t of tipos ?? []) porTipo[(t as any).tipo ?? "null"] = (porTipo[(t as any).tipo ?? "null"] ?? 0) + 1;
  // &xml=1 → baixa o XML da 1ª nota da amostra e mostra o começo CRU (para
  // decifrar o formato real que o parser precisa tratar).
  let xmlCru: Record<string, unknown> | null = null;
  if (u.searchParams.get("xml") === "1" && (amostra ?? []).length > 0) {
    const { getTinyConfig, tinyFetch } = await import("@/lib/services/tiny-api");
    const alvo = (amostra as any[])[0];
    const tinyId = String(alvo.id).split(":")[1];
    const empresa = alvo.empresa ?? "nyer";
    const c = getTinyConfig(empresa);
    try {
      const r = await tinyFetch(`${c.apiBaseUrl}/notas/${tinyId}/xml`, {}, empresa);
      const bruto = await r.text();
      xmlCru = {
        notaId: tinyId,
        status: r.status,
        contentType: r.headers.get("content-type"),
        tamanho: bruto.length,
        inicio: bruto.slice(0, 600),
      };
    } catch (e) {
      xmlCru = { erro: e instanceof Error ? e.message : "erro" };
    }
  }

  // &lista=1 → sonda a LISTAGEM /notas do Tiny com várias variantes de filtro,
  // para descobrir como pegar as notas de ENTRADA (compras de fornecedor).
  let listagem: Record<string, unknown> | null = null;
  if (u.searchParams.get("lista") === "1") {
    const { getTinyConfig, tinyFetch } = await import("@/lib/services/tiny-api");
    const mes = u.searchParams.get("mes") || new Date().toISOString().slice(0, 7);
    const fim = new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0).getDate();
    const base = `dataInicial=${mes}-01&dataFinal=${mes}-${String(fim).padStart(2, "0")}&limit=100`;
    const c = getTinyConfig("nyer");
    const variantes: Record<string, string> = {
      semFiltro: `/notas?${base}`,
      tipoE: `/notas?${base}&tipo=E`,
      tipoEntrada: `/notas?${base}&tipo=entrada`,
      tipo0: `/notas?${base}&tipo=0`,
      tipoNotaE: `/notas?${base}&tipoNota=E`,
    };
    listagem = { mes };
    for (const [nome, path] of Object.entries(variantes)) {
      try {
        const r = await tinyFetch(`${c.apiBaseUrl}${path}`, {}, "nyer");
        const txt = await r.text();
        let qtd: unknown = null, primeiro: unknown = null;
        try {
          const j = JSON.parse(txt);
          const itens = (j?.itens ?? j?.data ?? []) as any[];
          qtd = Array.isArray(itens) ? itens.length : null;
          primeiro = Array.isArray(itens) && itens[0]
            ? { id: itens[0].id, numero: itens[0].numero, tipo: itens[0].tipo ?? itens[0].tipoNota, situacao: itens[0].situacao }
            : null;
        } catch { primeiro = txt.slice(0, 200); }
        listagem[nome] = { status: r.status, qtd, primeiro };
      } catch (e) {
        listagem[nome] = { erro: e instanceof Error ? e.message : "erro" };
      }
      await new Promise((res) => setTimeout(res, 350));
    }
  }

  // &nota=ID → baixa o DETALHE e o XML de uma nota específica (para entender
  // por que as notas de ENTRADA não rendem XML).
  let nota: Record<string, unknown> | null = null;
  const notaId = u.searchParams.get("nota");
  if (notaId) {
    const { getTinyConfig, tinyFetch } = await import("@/lib/services/tiny-api");
    const c = getTinyConfig("nyer");
    nota = { id: notaId };
    try {
      const r = await tinyFetch(`${c.apiBaseUrl}/notas/${notaId}`, {}, "nyer");
      const txt = await r.text();
      nota.detalhe = { status: r.status, inicio: txt.slice(0, 700) };
    } catch (e) { nota.detalhe = { erro: e instanceof Error ? e.message : "erro" }; }
    await new Promise((res) => setTimeout(res, 400));
    try {
      const r = await tinyFetch(`${c.apiBaseUrl}/notas/${notaId}/xml`, {}, "nyer");
      const txt = await r.text();
      nota.xml = { status: r.status, contentType: r.headers.get("content-type"), tamanho: txt.length, inicio: txt.slice(0, 400) };
    } catch (e) { nota.xml = { erro: e instanceof Error ? e.message : "erro" }; }
  }

  return Response.json({ ok: true, total, semData, porTipo, amostra, xmlCru, listagem, nota, erro: error?.message ?? null });
}
