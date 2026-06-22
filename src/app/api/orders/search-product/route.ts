import { tinyFetch } from "@/lib/services/tiny-api";
import { ok, fail } from "@/lib/api";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const codigo = typeof body?.codigo === "string" ? body.codigo.trim() : "";

  if (!codigo) return fail("Código do produto obrigatório", 400);

  try {
    const res = await tinyFetch(`/produtos?filtro[codigo]=${encodeURIComponent(codigo)}&limit=1`);
    const json = await res.json();

    if (!res.ok) return fail(`Tiny retornou ${res.status}`, res.status);

    const produtos = (json.data ?? json.itens ?? []) as Array<{ id: number | string; codigo: string }>;

    if (produtos.length === 0) {
      return fail(`Produto com código ${codigo} não encontrado no Tiny`, 404);
    }

    const produto = produtos[0];
    return ok({ id: String(produto.id), codigo: produto.codigo });
  } catch (err) {
    return fail("Erro ao buscar produto no Tiny", 500, err instanceof Error ? err.message : err);
  }
}
