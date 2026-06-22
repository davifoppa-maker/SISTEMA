import { tinyFetch } from "@/lib/services/tiny-api";
import { ok, fail } from "@/lib/api";

// Diagnóstico: mostra o que o Tiny retorna ao buscar um SKU do nosso catálogo.
// Uso: /api/orders/diag-produto?sku=NYER26009
// Serve para confirmar se os códigos do nosso catálogo batem com os códigos
// reais cadastrados no Tiny (se não baterem, a busca pega o produto errado).
export async function GET(req: Request) {
  const sku = new URL(req.url).searchParams.get("sku") || "NYER26009";
  try {
    // 1) Busca por código (param V3 correto: ?codigo=).
    const porCodigo = await tinyFetch(`/produtos?codigo=${encodeURIComponent(sku)}`);
    const codigoJson = await porCodigo.json().catch(() => null);
    const porCodigoItens = ((codigoJson?.data ?? codigoJson?.itens ?? []) as any[]).map((p) => ({
      id: p?.id,
      sku: p?.sku ?? p?.codigo,
      descricao: p?.descricao ?? p?.nome,
      preco: p?.preco,
    }));

    // 2) Busca por nome (param V3 correto: ?nome=) pelo mesmo termo.
    const porPesquisa = await tinyFetch(`/produtos?nome=${encodeURIComponent(sku)}&limit=5`);
    const pesquisaJson = await porPesquisa.json().catch(() => null);
    const porPesquisaItens = ((pesquisaJson?.data ?? pesquisaJson?.itens ?? []) as any[]).map((p) => ({
      id: p?.id,
      sku: p?.sku ?? p?.codigo,
      descricao: p?.descricao ?? p?.nome,
      preco: p?.preco,
    }));

    return ok({
      skuBuscado: sku,
      filtroCodigo: { status: porCodigo.status, total: porCodigoItens.length, itens: porCodigoItens },
      pesquisa: { status: porPesquisa.status, total: porPesquisaItens.length, itens: porPesquisaItens },
    });
  } catch (err) {
    return fail("Erro no diagnóstico de produto", 500, err instanceof Error ? err.message : err);
  }
}
