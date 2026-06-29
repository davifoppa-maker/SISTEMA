import { ok, fail } from "@/lib/api";
import { fetchRecentOrders, isTinyConnected } from "@/lib/services/tiny-api";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Diagnóstico SÓ-LEITURA: lista os pedidos recentes de uma empresa direto do Tiny
// (sem gravar nada), para sabermos o que cada conta realmente devolve.
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("k") !== "exxdebug") return fail("não autorizado", 403);

  const empresa = url.searchParams.get("empresa") === "ecopro" ? "ecopro" : "nyer";
  const connected = await isTinyConnected(empresa).catch(() => false);
  if (!connected) return fail(`Tiny (${empresa}) não conectado`, 400);

  const dias = Number(url.searchParams.get("dias") ?? "60");
  const d = new Date();
  d.setDate(d.getDate() - dias);
  const dataInicial = d.toISOString().slice(0, 10);

  const list = await fetchRecentOrders({ dataInicial, limit: 30, offset: 0 }, empresa).catch(
    (e) => ({ erro: e instanceof Error ? e.message : String(e) }),
  );

  if (!Array.isArray(list)) return ok({ empresa, dataInicial, ...list });

  return ok({
    empresa,
    dataInicial,
    total: list.length,
    pedidos: list.map((o: any) => ({
      id: o.id,
      numero: o.numero,
      cliente: o.cliente?.nome,
      situacao: o.situacao,
      valor: o.valor,
    })),
  });
}
