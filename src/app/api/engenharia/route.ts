import { ok, fail } from "@/lib/api";
import { getTinyConfig, tinyFetch } from "@/lib/services/tiny-api";

export const dynamic = "force-dynamic";
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

  // Modo LISTA: devolve os produtos/sabores que casam com o termo (para o
  // seletor de sabor da calculadora).
  if (lista) {
    const r = await tinyFetch(`${c.apiBaseUrl}/produtos?pesquisa=${encodeURIComponent(lista)}&limit=50`, {}, empresa).catch(() => null);
    const j = r ? await r.json().catch(() => null) as any : null;
    const itens = (j?.itens ?? j?.data ?? []) as any[];
    // Só os FABRICADOS (tipo "F") — são os que têm engenharia; corta kits,
    // revenda e acessórios que poluíam o seletor de sabores.
    const sabores = itens
      .filter((i) => String(i.tipo ?? i.tipoProduto ?? "") === "F")
      .map((i) => ({ sku: i.sku ?? i.codigo ?? null, descricao: i.descricao ?? i.nome ?? "" }))
      .filter((i) => i.sku)
      .sort((a, b) => a.descricao.localeCompare(b.descricao, "pt-BR"));
    return ok({ sabores });
  }
  if (!sku && !busca) return fail("Informe ?sku=, ?busca= ou ?lista=", 400);

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
