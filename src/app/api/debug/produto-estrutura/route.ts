import { getTinyConfig, tinyFetch } from "@/lib/services/tiny-api";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Verifica se a API do Olist Tiny expõe a ENGENHARIA/estrutura (BOM) dos
// produtos FABRICADOS. Busca o produto por SKU/nome, baixa o cadastro completo
// e sonda os sub-recursos candidatos (estrutura/producao/componentes/kit).
//   GET /api/debug/produto-estrutura?k=exxdebug&sku=NYER26007
//   (ou &busca=whey%20refil — pega o 1º resultado; &empresa=ecopro)
export async function GET(req: Request) {
  const u = new URL(req.url);
  if (u.searchParams.get("k") !== "exxdebug") {
    return Response.json({ ok: false, error: "não autorizado" }, { status: 403 });
  }
  const empresa = u.searchParams.get("empresa") || "nyer";
  const sku = u.searchParams.get("sku") || "";
  const busca = u.searchParams.get("busca") || "";
  const c = getTinyConfig(empresa);

  // 1) Acha o produto (por código exato ou pesquisa livre).
  const tenta: Record<string, unknown> = {};
  let produtoId: string | null = null;
  let resumo: unknown = null;
  for (const q of [sku ? `codigo=${encodeURIComponent(sku)}` : "", busca ? `pesquisa=${encodeURIComponent(busca)}` : "", sku ? `pesquisa=${encodeURIComponent(sku)}` : ""].filter(Boolean)) {
    try {
      const r = await tinyFetch(`${c.apiBaseUrl}/produtos?${q}&limit=3`, {}, empresa);
      const j = await r.json().catch(() => null) as any;
      const itens = j?.itens ?? j?.data ?? (Array.isArray(j) ? j : []);
      tenta[`/produtos?${q}`] = `${r.status}: ${Array.isArray(itens) ? itens.length : 0} item(ns)`;
      if (Array.isArray(itens) && itens.length > 0) {
        produtoId = String(itens[0].id ?? itens[0].idProduto ?? "");
        resumo = { id: produtoId, sku: itens[0].sku ?? itens[0].codigo, descricao: itens[0].descricao ?? itens[0].nome, tipo: itens[0].tipo ?? itens[0].tipoProduto ?? itens[0].classeProduto };
        break;
      }
    } catch (e) {
      tenta[`/produtos?${q}`] = e instanceof Error ? e.message : "erro";
    }
  }
  if (!produtoId) {
    return Response.json({ ok: false, error: "Produto não encontrado — informe ?sku= ou ?busca=", tentativasBusca: tenta });
  }

  // 2) Cadastro COMPLETO: lista as chaves e destaca campos de estrutura.
  let cadastro: Record<string, unknown> = {};
  try {
    const r = await tinyFetch(`${c.apiBaseUrl}/produtos/${produtoId}`, {}, empresa);
    const j = await r.json().catch(() => null) as any;
    const raw = j?.data ?? j ?? {};
    const chaves = Object.keys(raw);
    const interessantes: Record<string, unknown> = {};
    for (const k of chaves) {
      if (/estrutur|produc|componen|kit|fabric|materia|insumo|bom/i.test(k)) interessantes[k] = raw[k];
    }
    cadastro = {
      status: r.status,
      chavesDoCadastro: chaves,
      camposDeEngenharia: Object.keys(interessantes).length > 0 ? interessantes : "(nenhum campo de estrutura no cadastro)",
      tipoProduto: raw.tipo ?? raw.tipoProduto ?? raw.classeProduto ?? null,
    };
  } catch (e) {
    cadastro = { erro: e instanceof Error ? e.message : "erro" };
  }

  // 3) Sub-recursos candidatos da engenharia.
  const subrecursos: Record<string, string> = {};
  for (const sub of ["estrutura", "producao", "componentes", "kit", "fabricacao", "estoque"]) {
    try {
      const r = await tinyFetch(`${c.apiBaseUrl}/produtos/${produtoId}/${sub}`, {}, empresa);
      const t = await r.text();
      subrecursos[`/produtos/{id}/${sub}`] = `${r.status}: ${t.slice(0, 220)}`;
    } catch (e) {
      subrecursos[`/produtos/{id}/${sub}`] = e instanceof Error ? e.message : "erro";
    }
  }

  return Response.json({ ok: true, produto: resumo, cadastro, subrecursos, tentativasBusca: tenta });
}
