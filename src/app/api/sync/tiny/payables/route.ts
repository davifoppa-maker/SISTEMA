import { ok, fail } from "@/lib/api";
import { syncPayablesAllCompanies } from "@/lib/services/financeiro-sync";

export const maxDuration = 60;

// Sincroniza contas a pagar das duas empresas (NRX + Ecopro) do Olist Tiny.
export async function POST() {
  const r = await syncPayablesAllCompanies();
  const algumConectado = Object.values(r.diag).some((v) => typeof v === "number");
  if (r.synced === 0 && !algumConectado) return fail("Tiny não conectado (nenhuma empresa)", 400, r.diag);
  return ok(r);
}
