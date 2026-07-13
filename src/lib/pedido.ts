// Helpers de status de pedido.

function normNome(s: string | null | undefined): string {
  return String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
}

// Clientes INTERNOS a excluir das análises (contas próprias / transferências).
// Comparação por "contém". Vazio = ninguém excluído (Exx Nutrition volta a
// contar no faturamento, para bater com o Olist).
const CLIENTES_IGNORADOS: string[] = [];

export function clienteIgnorado(nome: string | null | undefined): boolean {
  const n = normNome(nome);
  if (!n) return false;
  return CLIENTES_IGNORADOS.some((c) => n.includes(c));
}

// Pedido CANCELADO no Olist/Tiny. O status vem como texto ("cancelada") ou
// como código V3 (2 = cancelada). Não deve contar em faturamento/margem.
export function ehCancelado(tinyStatus: string | null | undefined): boolean {
  const s = String(tinyStatus ?? "").trim().toLowerCase();
  if (!s) return false;
  return s === "2" || s.includes("cancel");
}
