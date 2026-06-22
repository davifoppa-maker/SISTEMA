import { tinyFetch } from "@/lib/services/tiny-api";
import { ok, fail } from "@/lib/api";

// Diagnóstico: lista os pedidos mais recentes da CONTA Tiny conectada.
// Serve para comparar com o que aparece no Olist e descobrir se o app está
// gravando na conta certa.
export async function GET() {
  try {
    const res = await tinyFetch("/pedidos?orderBy=desc&limit=15");
    const text = await res.text();
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* */ }

    if (!res.ok) {
      return fail(`Tiny ${res.status}`, res.status, text.slice(0, 400));
    }

    const itens = (json?.itens ?? json?.data ?? (Array.isArray(json) ? json : [])) as any[];
    const pedidos = itens.map((p) => ({
      id: p?.id ?? null,
      numeroPedido: p?.numeroPedido ?? p?.numero ?? null,
      data: p?.dataCriacao ?? p?.data ?? null,
      situacao: p?.situacao ?? p?.descricaoSituacao ?? null,
      cliente: p?.cliente?.nome ?? p?.nomeCliente ?? null,
      valor: p?.valor ?? p?.valorTotal ?? null,
      ecommerce: p?.ecommerce?.nome ?? p?.nomeEcommerce ?? null,
    }));

    return ok({ total: pedidos.length, pedidos });
  } catch (err) {
    return fail("Erro ao listar pedidos", 500, err instanceof Error ? err.message : err);
  }
}
