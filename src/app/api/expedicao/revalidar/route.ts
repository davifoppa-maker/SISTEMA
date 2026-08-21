import { ok, fail } from "@/lib/api";
import { loadStore, commitStore } from "@/lib/db";
import { ingestOrder, removeOrderCascade } from "@/lib/services/tiny";
import { fetchOrderById } from "@/lib/services/tiny-api";
import { tinyOrderSchema } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// REVALIDA a fila de expedição contra o Olist: para cada pedido "na fila"
// (aprovado/aberto no nosso banco), busca o estado ATUAL no Tiny e:
//   • pedido mudou (faturado/enviado/cancelado) → atualiza aqui;
//   • pedido APAGADO no Tiny (404 confirmado) → remove daqui;
//   • de quebra, atualiza pagamento/natureza/itens do payload completo.
export async function POST() {
  const store = await loadStore(); // completo — removeOrderCascade toca várias tabelas
  const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const fila = store.orders
    .filter((o) => {
      const s = String(o.tiny_status ?? "").toLowerCase();
      return o.tiny_id && (s.includes("aprovad") || s.includes("abert"));
    })
    .slice(0, 40); // cap por rodada (rate limit do Tiny)

  let atualizados = 0;
  let removidos = 0;
  const removidosNums: string[] = [];
  for (const o of fila) {
    let achou = false;
    let erroRede = false;
    for (const emp of [((o as any).empresa ?? "nyer") as string, ((o as any).empresa ?? "nyer") === "ecopro" ? "nyer" : "ecopro"]) {
      try {
        const payload = await fetchOrderById(o.tiny_id!, emp);
        if (payload) {
          achou = true;
          try {
            ingestOrder(store, tinyOrderSchema.parse(payload), emp);
            atualizados++;
          } catch { /* payload fora do schema — mantém como está */ }
          break;
        }
      } catch {
        erroRede = true; // indisponível ≠ apagado
      }
    }
    if (!achou && !erroRede) {
      removeOrderCascade(store, o.id);
      removidos++;
      removidosNums.push(o.order_number);
    }
    await pausa(150);
  }

  if (atualizados > 0 || removidos > 0) await commitStore(store);
  return ok({ verificados: fila.length, atualizados, removidos, removidosNums });
}
