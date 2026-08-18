import { loadStoreFor, commitStore } from "@/lib/db";
import { enrichOrderMetadata } from "@/lib/services/tiny";
import type { DataStore } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

// Preenche a natureza de operação/marcadores em LOTES PEQUENOS e rápidos (cabe
// no limite real da plataforma). Devolve uma página HTML que se recarrega
// sozinha a cada 2s até acabar — deixe a aba aberta, não precisa clicar em nada.
//   GET /api/debug/backfill-natop?k=exxdebug
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("k") !== "exxdebug") {
    return new Response("não autorizado", { status: 403 });
  }

  const store = await loadStoreFor(["orders"] as Array<keyof DataStore>);
  const antes = store.orders.filter((o) => o.tiny_id && !(o as any).nat_operacao).length;
  const atualizados = await enrichOrderMetadata(store, 12); // lote pequeno, rápido
  if (atualizados > 0) await commitStore(store);
  const pendentes = Math.max(0, antes - atualizados);

  const terminou = atualizados === 0 || pendentes === 0;
  const html = `<!doctype html><html><head><meta charset="utf-8">
${terminou ? "" : '<meta http-equiv="refresh" content="2">'}
<title>Backfill natureza de operação</title>
<style>body{font-family:system-ui;background:#0a0f1c;color:#e2e8f0;padding:40px;font-size:18px}
b{color:#facc15}.ok{color:#34d399}</style></head>
<body>
<h2>🔄 Preenchendo natureza de operação / marcadores…</h2>
<p>Nesta rodada: <b>${atualizados}</b> pedido(s) atualizado(s).</p>
<p>Ainda pendentes (estimativa): <b>${pendentes}</b></p>
${terminou
  ? '<p class="ok"><b>✅ Concluído!</b> Pode fechar esta aba e conferir os Bonificados.</p>'
  : '<p>Recarregando sozinho a cada 2s… deixe esta aba aberta.</p>'}
</body></html>`;

  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
