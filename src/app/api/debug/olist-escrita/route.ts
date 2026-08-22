import { getSupabaseAdmin } from "@/lib/db/supabase-store";
import { getTinyConfig, tinyFetch } from "@/lib/services/tiny-api";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// SONDA DE ESCRITA no Olist: testa se a API aceita ALTERAR a transportadora de
// um pedido. Segurança: só roda no pedido informado (?pedido=NUMERO) e só toca
// o campo transportadora. Testa os formatos candidatos e reporta cada resposta.
//   GET /api/debug/olist-escrita?k=exxdebug&pedido=352&transportadora=Braspress
export async function GET(req: Request) {
  const u = new URL(req.url);
  if (u.searchParams.get("k") !== "exxdebug") {
    return Response.json({ ok: false, error: "não autorizado" }, { status: 403 });
  }
  const numero = (u.searchParams.get("pedido") || "").trim();
  const transp = (u.searchParams.get("transportadora") || "Braspress").trim();
  if (!numero) return Response.json({ ok: false, error: "Informe ?pedido=NUMERO (use um pedido de TESTE)" });

  const sb = getSupabaseAdmin();
  const { data: order } = await sb.from("orders").select("*").eq("order_number", numero).maybeSingle();
  if (!order?.tiny_id) return Response.json({ ok: false, error: `Pedido ${numero} sem tiny_id no sistema.` });
  const empresa = (order as any).empresa ?? "nyer";
  const c = getTinyConfig(empresa);

  const tentativas: Record<string, string> = {};
  const tenta = async (rotulo: string, metodo: string, path: string, body: unknown) => {
    try {
      const r = await tinyFetch(`${c.apiBaseUrl}${path}`, {
        method: metodo,
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
      }, empresa);
      const t = await r.text();
      tentativas[rotulo] = `${r.status}: ${t.slice(0, 250)}`;
      return r.ok;
    } catch (e) {
      tentativas[rotulo] = e instanceof Error ? e.message : "erro";
      return false;
    }
  };

  // Formatos candidatos (para de testar no primeiro que der 2xx).
  const id = order.tiny_id;
  if (await tenta("PUT /pedidos/{id} {transportador:{nome}}", "PUT", `/pedidos/${id}`, { transportador: { nome: transp } })) {
    return Response.json({ ok: true, funcionou: "PUT transportador.nome", tentativas });
  }
  if (await tenta("PUT /pedidos/{id} {transportadora}", "PUT", `/pedidos/${id}`, { transportadora: transp })) {
    return Response.json({ ok: true, funcionou: "PUT transportadora", tentativas });
  }
  if (await tenta("PATCH /pedidos/{id} {transportador:{nome}}", "PATCH", `/pedidos/${id}`, { transportador: { nome: transp } })) {
    return Response.json({ ok: true, funcionou: "PATCH transportador.nome", tentativas });
  }
  if (await tenta("PUT /pedidos/{id}/transporte", "PUT", `/pedidos/${id}/transporte`, { transportador: { nome: transp } })) {
    return Response.json({ ok: true, funcionou: "PUT /transporte", tentativas });
  }
  return Response.json({ ok: false, error: "Nenhum formato aceito — ver tentativas.", tentativas });
}
