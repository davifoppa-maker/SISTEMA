import { ok, fail } from "@/lib/api";
import { getTinyConfig, tinyFetch } from "@/lib/services/tiny-api";

export const dynamic = "force-dynamic";

// Cache em memória das buscas por termo (10 min): busca repetida fica
// instantânea e poupa o rate limit do Tiny.
const listaCache = new Map<string, { dados: Record<string, unknown>; exp: number }>();
export const maxDuration = 60;

// Engenharia (BOM) de um produto FABRICADO via API do Olist, já convertida para
// consumo POR UNIDADE. O lote é inferido pela quantidade da embalagem (pouch/
// pote — o insumo de maior quantidade unitária), ex.: 295 pouches = lote de 295.
//   GET /api/engenharia?sku=NYER260430   (ou ?busca=milk)
export async function GET(req: Request) {
  const u = new URL(req.url);
  const empresa = u.searchParams.get("empresa") || "nyer";
  const sku = u.searchParams.get("sku") || "";
  const busca = u.searchParams.get("busca") || "";
  const lista = u.searchParams.get("lista") || "";
  const c = getTinyConfig(empresa);

  // Modo LISTA: sabores/produtos COM engenharia. Verifica o BOM de cada
  // candidato em LOTES PARALELOS pequenos (rápido), com retry em 429 — antes a
  // checagem sequencial estourava o rate limit e devolvia lista vazia.
  if (lista) {
    const chaveCache = `${empresa}:${lista.toLowerCase().trim()}`;
    const hitCache = listaCache.get(chaveCache);
    if (hitCache && hitCache.exp > Date.now()) {
      return ok({ versaoLista: "v3-cache", ...hitCache.dados });
    }
    const r = await tinyFetch(`${c.apiBaseUrl}/produtos?pesquisa=${encodeURIComponent(lista)}&limit=50`, {}, empresa).catch(() => null);
    const j = r ? await r.json().catch(() => null) as any : null;
    const candidatos = ((j?.itens ?? j?.data ?? []) as any[])
      .map((i) => ({ id: i.id, sku: i.sku ?? i.codigo ?? null, descricao: i.descricao ?? i.nome ?? "" }))
      .filter((i) => i.id && i.sku)
      .slice(0, 30);

    const pausaMs = (ms: number) => new Promise((res) => setTimeout(res, ms));
    let falhas429 = 0;

    const verifica = async (cand: { id: string; sku: string; descricao: string }) => {
      for (let tent = 0; tent < 2; tent++) {
        try {
          const rd = await tinyFetch(`${c.apiBaseUrl}/produtos/${cand.id}`, {}, empresa);
          if (rd.status === 429) { falhas429++; await pausaMs(900); continue; }
          const jd = await rd.json().catch(() => null) as any;
          const raw = jd?.data ?? jd ?? {};
          const bomLista: any[] = raw?.producao?.produtos ?? [];
          return Array.isArray(bomLista) && bomLista.length > 0;
        } catch { /* tenta de novo */ }
      }
      return false;
    };

    const sabores: { sku: string; descricao: string }[] = [];
    for (let i = 0; i < candidatos.length; i += 5) {
      const lote = candidatos.slice(i, i + 5);
      const oks = await Promise.all(lote.map(verifica));
      lote.forEach((cand, idx) => { if (oks[idx]) sabores.push({ sku: String(cand.sku), descricao: cand.descricao }); });
      await pausaMs(300);
    }
    sabores.sort((a, b) => a.descricao.localeCompare(b.descricao, "pt-BR"));
    const dados = { candidatos: candidatos.length, falhas429, sabores };
    // Só cacheia resultados sem rate limit (senão congela uma lista incompleta).
    if (falhas429 === 0) listaCache.set(chaveCache, { dados, exp: Date.now() + 10 * 60 * 1000 });
    return ok({ versaoLista: "v3-paralela", ...dados });
  }
  // Modo TODAS (?todas=1): lista OFICIAL de produtos com engenharia
  // (confirmada pelo usuário em 20/08/2026). Sem varredura — só busca as
  // descrições no Olist (1 chamada por SKU, com cache de 30 min).
  // Produto novo com engenharia? Adicionar o SKU aqui.
  if (u.searchParams.get("todas") === "1") {
    const ENGENHARIA_SKUS = [
      "NYER260432", "NYER260430", "NYER260433", "NYER260431", "NYER260434",
      "NYER26029", "NYER26099", "NYER260101", "NYER260102", "NYER21321", "NYER6921",
    ];
    const chave = `todas:${empresa}`;
    const hit = listaCache.get(chave);
    if (hit && hit.exp > Date.now()) return ok({ versaoLista: "todas-fixa-cache", ...hit.dados });

    const sabores: { sku: string; descricao: string }[] = [];
    for (const skuEng of ENGENHARIA_SKUS) {
      try {
        const r = await tinyFetch(`${c.apiBaseUrl}/produtos?codigo=${encodeURIComponent(skuEng)}&limit=1`, {}, empresa);
        const j = await r.json().catch(() => null) as any;
        const item = (j?.itens ?? j?.data ?? [])[0];
        sabores.push({ sku: skuEng, descricao: item?.descricao ?? item?.nome ?? skuEng });
      } catch {
        sabores.push({ sku: skuEng, descricao: skuEng }); // mostra pelo SKU se a busca falhar
      }
      await new Promise((res) => setTimeout(res, 120));
    }
    sabores.sort((a, b) => a.descricao.localeCompare(b.descricao, "pt-BR"));
    const dados = { sabores };
    listaCache.set(chave, { dados, exp: Date.now() + 30 * 60 * 1000 });
    return ok({ versaoLista: "todas-fixa", ...dados });
  }

  if (!sku && !busca) return fail("Informe ?sku=, ?busca=, ?lista= ou ?todas=1", 400);

  // Acha o produto.
  let produtoId: string | null = null;
  let cab: { sku?: string; descricao?: string } = {};
  for (const q of [sku ? `codigo=${encodeURIComponent(sku)}` : "", (busca || sku) ? `pesquisa=${encodeURIComponent(busca || sku)}` : ""].filter(Boolean)) {
    const r = await tinyFetch(`${c.apiBaseUrl}/produtos?${q}&limit=3`, {}, empresa).catch(() => null);
    const j = r ? await r.json().catch(() => null) as any : null;
    const itens = j?.itens ?? j?.data ?? [];
    if (Array.isArray(itens) && itens.length > 0) {
      produtoId = String(itens[0].id ?? "");
      cab = { sku: itens[0].sku ?? itens[0].codigo, descricao: itens[0].descricao ?? itens[0].nome };
      break;
    }
  }
  if (!produtoId) return fail("Produto não encontrado no Olist.", 404);

  const r = await tinyFetch(`${c.apiBaseUrl}/produtos/${produtoId}`, {}, empresa);
  const j = await r.json().catch(() => null) as any;
  const raw = j?.data ?? j ?? {};
  const bom: any[] = raw?.producao?.produtos ?? [];
  if (!Array.isArray(bom) || bom.length === 0) {
    return fail(`"${cab.descricao ?? sku}" não tem engenharia cadastrada no Olist.`, 404);
  }

  // Lote = maior quantidade entre os insumos "unitários" (pouch/pote/colher).
  const qtds = bom.map((b) => Number(b.quantidade) || 0);
  const unidadesLote = Math.max(...qtds.filter((q) => Number.isInteger(q)), 1);

  // Busca o PREÇO DE CUSTO de cada insumo no cadastro do Olist (campo precos) —
  // evita digitação manual; o usuário só sobrepõe quando quiser.
  const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const insumos: { sku: string | null; descricao: string; qtdLote: number; qtdPorUnidade: number; custoOlist: number | null }[] = [];
  for (const b of bom.slice(0, 30)) {
    const q = Number(b.quantidade) || 0;
    let custoOlist: number | null = null;
    const insumoId = b.produto?.id;
    if (insumoId) {
      try {
        const ri = await tinyFetch(`${c.apiBaseUrl}/produtos/${insumoId}`, {}, empresa);
        const ji = await ri.json().catch(() => null) as any;
        const precos = ji?.data?.precos ?? ji?.precos ?? {};
        const cand = Number(precos.precoCusto ?? precos.preco_custo ?? precos.precoCustoMedio ?? precos.preco_custo_medio ?? 0);
        if (Number.isFinite(cand) && cand > 0) custoOlist = cand;
      } catch { /* segue sem custo */ }
      await pausa(100);
    }
    insumos.push({
      sku: b.produto?.sku ?? null,
      descricao: b.produto?.descricao ?? "Insumo",
      qtdLote: q,
      qtdPorUnidade: Number((q / unidadesLote).toFixed(6)),
      custoOlist,
    });
  }

  return ok({ produto: cab, unidadesLote, insumos });
}
