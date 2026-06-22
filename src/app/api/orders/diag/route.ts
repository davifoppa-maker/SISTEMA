import { tinyFetch } from "@/lib/services/tiny-api";
import { ok, fail } from "@/lib/api";

// Endpoint de diagnóstico: testa POST /pedidos com payload mínimo
export async function GET() {
  const results: Record<string, unknown> = {};

  // 1. Pegar um produto existente
  try {
    const r = await tinyFetch("/produtos?limit=1");
    const j = await r.json();
    results.produtos_status = r.status;
    results.primeiro_produto = (j.data ?? j.itens ?? [])[0] ?? null;
  } catch (e) {
    results.produtos_erro = String(e);
  }

  // 2. Pegar um contato existente
  try {
    const r = await tinyFetch("/contatos?limit=1");
    const j = await r.json();
    results.contatos_status = r.status;
    results.primeiro_contato = (j.data ?? j.itens ?? [])[0] ?? null;
  } catch (e) {
    results.contatos_erro = String(e);
  }

  // 3. Tentar criar pedido mínimo com IDs reais
  const produto = (results.primeiro_produto as any);
  const contato = (results.primeiro_contato as any);

  if (produto?.id && contato?.id) {
    try {
      const payload = {
        idContato: contato.id,
        situacao: 1,
        itens: [{ produto: { id: produto.id }, quantidade: 1, valorUnitario: 0.01 }],
      };
      results.payload_teste = payload;

      const r = await tinyFetch("/pedidos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const text = await r.text();
      results.criacao_status = r.status;
      try { results.criacao_resposta = JSON.parse(text); } catch { results.criacao_resposta = text; }
    } catch (e) {
      results.criacao_erro = String(e);
    }
  }

  return ok(results);
}
