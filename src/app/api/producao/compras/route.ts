import { ok, fail } from "@/lib/api";
import { getTinyConfig, tinyFetch } from "@/lib/services/tiny-api";
import { getEstoqueReport } from "@/lib/services/estoque";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// NECESSIDADE DE COMPRA de matéria-prima: recebe a lista de produtos a produzir
// (sku + qtd), explode a ENGENHARIA de cada um via Olist (consumo por unidade),
// soma os insumos e cruza com o estoque do balanço → o que falta COMPRAR.
//   POST { itens: [{ sku, nome, qtd }] }
export async function POST(req: Request) {
  let body: { itens?: { sku?: string | null; nome?: string; qtd?: number }[] };
  try {
    body = await req.json();
  } catch {
    return fail("JSON inválido.", 400);
  }
  const itens = (body.itens ?? [])
    .filter((i) => i.sku && (i.qtd ?? 0) > 0)
    .slice(0, 40); // limite de segurança (cada produto = 2 chamadas ao Tiny)
  if (itens.length === 0) return fail("Nenhum produto com falta para explodir.", 400);

  const c = getTinyConfig("nyer");
  const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

  interface Necessidade { descricao: string; necessario: number }
  const porInsumo = new Map<string, Necessidade>();
  const semEngenharia: { sku: string; nome: string }[] = [];
  const explodidos: { sku: string; nome: string; unidades: number }[] = [];

  for (const item of itens) {
    const sku = String(item.sku);
    try {
      // Produto → id → cadastro com producao.
      const rb = await tinyFetch(`${c.apiBaseUrl}/produtos?codigo=${encodeURIComponent(sku)}&limit=1`, {}, "nyer");
      const jb = await rb.json().catch(() => null) as any;
      const id = jb?.itens?.[0]?.id ?? jb?.data?.[0]?.id;
      if (!id) { semEngenharia.push({ sku, nome: item.nome ?? sku }); continue; }
      await pausa(120);
      const rd = await tinyFetch(`${c.apiBaseUrl}/produtos/${id}`, {}, "nyer");
      const jd = await rd.json().catch(() => null) as any;
      const bom: any[] = jd?.data?.producao?.produtos ?? [];
      if (!Array.isArray(bom) || bom.length === 0) { semEngenharia.push({ sku, nome: item.nome ?? sku }); continue; }

      const qtds = bom.map((b) => Number(b.quantidade) || 0);
      const unidadesLote = Math.max(...qtds.filter((q) => Number.isInteger(q)), 1);
      for (const b of bom) {
        const insSku = b.produto?.sku ? String(b.produto.sku) : b.produto?.descricao ?? "?";
        const porUnidade = (Number(b.quantidade) || 0) / unidadesLote;
        const e = porInsumo.get(insSku) ?? { descricao: b.produto?.descricao ?? insSku, necessario: 0 };
        e.necessario += porUnidade * (item.qtd ?? 0);
        porInsumo.set(insSku, e);
      }
      explodidos.push({ sku, nome: item.nome ?? sku, unidades: item.qtd ?? 0 });
      await pausa(120);
    } catch {
      semEngenharia.push({ sku, nome: item.nome ?? sku });
    }
  }

  // Estoque de insumos: balanço (todas as abas), casando por SKU.
  const estoquePorSku = new Map<string, number>();
  let estoqueErro: string | null = null;
  try {
    const rep = await getEstoqueReport();
    for (const it of rep.itens) {
      if (it.sku) {
        const s = it.sku.toUpperCase();
        estoquePorSku.set(s, (estoquePorSku.get(s) ?? 0) + it.quantidade);
      }
    }
  } catch (e) {
    estoqueErro = e instanceof Error ? e.message : "Balanço indisponível.";
  }

  const linhas = [...porInsumo.entries()]
    .map(([sku, n]) => {
      const emEstoque = estoquePorSku.get(sku.toUpperCase()) ?? null;
      const comprar = emEstoque != null ? Math.max(0, n.necessario - emEstoque) : null;
      return {
        sku,
        descricao: n.descricao,
        necessario: Math.round(n.necessario * 100) / 100,
        emEstoque,
        comprar: comprar != null ? Math.round(comprar * 100) / 100 : null,
      };
    })
    .sort((a, b) => (b.comprar ?? 0) - (a.comprar ?? 0));

  return ok({ linhas, explodidos, semEngenharia, estoqueErro });
}
