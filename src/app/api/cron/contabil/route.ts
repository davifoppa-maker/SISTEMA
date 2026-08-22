import { ok } from "@/lib/api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// CRON DIÁRIO da Contábil: sincroniza as notas fiscais da NRX sem clique.
// Roda o sync do MÊS CORRENTE (até 2 rodadas de 35 XMLs — sobra folga para o
// dia a dia; a 1ª carga grande é manual) e, nos primeiros 5 dias do mês,
// também UMA rodada do mês anterior (notas emitidas na virada).
async function rodaSync(base: string, mes: string, rodadas: number): Promise<unknown[]> {
  const out: unknown[] = [];
  for (let i = 0; i < rodadas; i++) {
    const r = await fetch(`${base}/api/contabil/sync?mes=${mes}&empresa=nyer`, { method: "POST" }).catch(() => null);
    const j = r ? await r.json().catch(() => null) : null;
    out.push(j?.data ?? j?.error ?? "falha");
    if (!j?.data || (j.data.pendentes ?? 0) <= 0) break;
  }
  return out;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const base = `${url.protocol}//${url.host}`;
  const agora = new Date();
  const mes = agora.toISOString().slice(0, 7);
  const resultado: Record<string, unknown> = {};
  resultado[mes] = await rodaSync(base, mes, 2);
  if (agora.getDate() <= 5) {
    const ant = new Date(agora.getFullYear(), agora.getMonth() - 1, 1);
    const mesAnt = `${ant.getFullYear()}-${String(ant.getMonth() + 1).padStart(2, "0")}`;
    resultado[mesAnt] = await rodaSync(base, mesAnt, 1);
  }
  return ok(resultado);
}
export async function POST(req: Request) { return GET(req); }
