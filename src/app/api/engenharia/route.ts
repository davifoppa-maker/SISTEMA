import { ok, fail } from "@/lib/api";
import { getTinyConfig, tinyFetch } from "@/lib/services/tiny-api";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Engenharia (BOM) de um produto FABRICADO via API do Olist, já convertida para
// consumo POR UNIDADE. O lote é inferido pela quantidade da embalagem (pouch/
// pote — o insumo de maior quantidade unitária), ex.: 295 pouches = lote de 295.
//   GET /api/engenharia?sku=NYER260430   (ou ?busca=milk)
export async function GET(req: Request) {
  const u = new URL(req.url);
  const empresa = u.searchParams.get("empresa") || "nyer";
  const sku = u.searchParams.get("sku") || "";
  const busca = u.searchParams.get("busca") || "";
  if (!sku && !busca) return fail("Informe ?sku= ou ?busca=", 400);
  const c = getTinyConfig(empresa);

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

  const insumos = bom.map((b) => {
    const q = Number(b.quantidade) || 0;
    return {
      sku: b.produto?.sku ?? null,
      descricao: b.produto?.descricao ?? "Insumo",
      qtdLote: q,
      qtdPorUnidade: Number((q / unidadesLote).toFixed(6)),
    };
  });

  return ok({ produto: cab, unidadesLote, insumos });
}
