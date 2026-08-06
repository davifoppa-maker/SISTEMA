import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { loadStoreFor } from "@/lib/db";
import { fetchRecentOrders, isTinyConnected } from "@/lib/services/tiny-api";
import { ehCancelado } from "@/lib/pedido";
import { buildSellerCanonicalizer } from "@/lib/seller";
import { brl } from "@/lib/utils/format";
import { RemoverApagadosButton } from "./remover-button";
import type { DataStore } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const COMPANIES = ["nyer", "ecopro"] as const;

function inicioDoMes() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function hoje() {
  return new Date().toISOString().slice(0, 10);
}

export default async function ConferenciaPage({
  searchParams,
}: {
  searchParams: { de?: string; ate?: string };
}) {
  const de = searchParams.de || inicioDoMes();
  const ate = searchParams.ate || hoje();

  try {
  // OLIST: pagina os pedidos das duas contas no período.
  const olist = new Map<string, { valor: number; situacao: string; empresa: string; vendedor: string }>();
  const olistErros: string[] = [];
  for (const empresa of COMPANIES) {
    if (!(await isTinyConnected(empresa).catch(() => false))) { olistErros.push(`${empresa}: não conectado`); continue; }
    try {
      for (let offset = 0; offset < 3000; offset += 100) {
        const lote = await fetchRecentOrders({ dataInicial: de, dataFinal: ate, limit: 100, offset }, empresa);
        if (!lote.length) break;
        for (const p of lote as any[]) {
          const numero = String(p.numero ?? "");
          if (numero && !olist.has(numero)) olist.set(numero, { valor: Number(p.valor ?? 0) || 0, situacao: String(p.situacao ?? ""), empresa, vendedor: String(p.vendedor ?? "") });
        }
        if (lote.length < 100) break;
      }
    } catch (e) { olistErros.push(`${empresa}: ${e instanceof Error ? e.message : String(e)}`); }
  }

  // NOSSO SISTEMA: pedidos no mesmo período (por order_date).
  const store = await loadStoreFor(["orders"] as Array<keyof DataStore>);
  const dentro = (d: string | null) => { const x = (d ?? "").slice(0, 10); return !!x && x >= de && x <= ate; };
  const nosso = new Map<string, { valor: number; situacao: string; vendedor: string }>();
  for (const o of store.orders) {
    if (!dentro(o.order_date)) continue;
    nosso.set(String(o.order_number ?? ""), { valor: Number(o.total_value ?? 0) || 0, situacao: o.tiny_status ?? "", vendedor: o.seller ?? "" });
  }

  // COMPARAÇÃO POR VENDEDOR — mesmo canonicalizador nos dois lados (nomes alinhados).
  const canonVend = buildSellerCanonicalizer([
    ...[...olist.values()].map((v) => v.vendedor),
    ...[...nosso.values()].map((v) => v.vendedor),
  ]);
  const olistVend = new Map<string, number>();
  for (const v of olist.values()) { if (ehCancelado(v.situacao)) continue; const k = canonVend(v.vendedor); olistVend.set(k, (olistVend.get(k) ?? 0) + v.valor); }
  const sysVend = new Map<string, number>();
  for (const v of nosso.values()) { if (ehCancelado(v.situacao)) continue; const k = canonVend(v.vendedor); sysVend.set(k, (sysVend.get(k) ?? 0) + v.valor); }
  const vendedores = [...new Set([...olistVend.keys(), ...sysVend.keys()])]
    .map((nome) => ({ nome, olist: olistVend.get(nome) ?? 0, nosso: sysVend.get(nome) ?? 0 }))
    .map((r) => ({ ...r, diff: r.olist - r.nosso }))
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

  const somaOlist = [...olist.values()].filter((v) => !ehCancelado(v.situacao)).reduce((s, v) => s + v.valor, 0);
  const somaNosso = [...nosso.values()].filter((v) => !ehCancelado(v.situacao)).reduce((s, v) => s + v.valor, 0);

  const soNoOlist = [...olist.entries()].filter(([n, v]) => !nosso.has(n) && !ehCancelado(v.situacao))
    .map(([numero, v]) => ({ numero, valor: v.valor, empresa: v.empresa }))
    .sort((a, b) => b.valor - a.valor);
  const soNoNosso = [...nosso.entries()].filter(([n, v]) => !olist.has(n) && !ehCancelado(v.situacao))
    .map(([numero, v]) => ({ numero, valor: v.valor, situacao: v.situacao }))
    .sort((a, b) => b.valor - a.valor);
  const divergente = [...olist.entries()].filter(([n, v]) => { const m = nosso.get(n); return m && Math.abs(m.valor - v.valor) > 0.5; })
    .map(([numero, v]) => ({ numero, olist: v.valor, nosso: nosso.get(numero)!.valor }))
    .sort((a, b) => Math.abs(b.olist - b.nosso) - Math.abs(a.olist - a.nosso));

  const diff = somaOlist - somaNosso;
  const somaSoOlist = soNoOlist.reduce((s, o) => s + o.valor, 0);
  const somaSoNosso = soNoNosso.reduce((s, o) => s + o.valor, 0);
  const somaDiverg = divergente.reduce((s, o) => s + (o.olist - o.nosso), 0);

  const Cell = ({ children, r = false }: { children: React.ReactNode; r?: boolean }) => (
    <td className={`px-3 py-1.5 ${r ? "text-right" : ""}`}>{children}</td>
  );

  return (
    <>
      <PageHeader title="🔎 Conferência Olist × Sistema" description={`Período ${de.split("-").reverse().join("/")} a ${ate.split("-").reverse().join("/")} — compara pedido a pedido.`} />

      <form method="get" className="mb-4 flex flex-wrap items-end gap-3">
        <div><label className="mb-1 block text-xs text-slate-400">De</label>
          <input type="date" name="de" defaultValue={de} className="h-10 rounded-lg border border-white/15 bg-white/5 px-3 text-sm text-white" /></div>
        <div><label className="mb-1 block text-xs text-slate-400">Até</label>
          <input type="date" name="ate" defaultValue={ate} className="h-10 rounded-lg border border-white/15 bg-white/5 px-3 text-sm text-white" /></div>
        <button className="h-10 rounded-lg bg-violet-600 px-4 text-sm font-medium text-white">Conferir</button>
      </form>

      {olistErros.length > 0 ? (
        <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-300">
          Aviso Olist: {olistErros.join(" · ")}
        </div>
      ) : null}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs uppercase text-slate-400">Olist</div>
          <div className="mt-1 text-2xl font-bold text-white">{brl(somaOlist)}</div>
          <div className="text-[11px] text-slate-400">{[...olist.values()].filter((v) => !ehCancelado(v.situacao)).length} pedidos</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs uppercase text-slate-400">Nosso sistema</div>
          <div className="mt-1 text-2xl font-bold text-white">{brl(somaNosso)}</div>
          <div className="text-[11px] text-slate-400">{[...nosso.values()].filter((v) => !ehCancelado(v.situacao)).length} pedidos</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs uppercase text-slate-400">Diferença</div>
          <div className={`mt-1 text-2xl font-bold ${Math.abs(diff) < 1 ? "text-emerald-400" : "text-red-400"}`}>{brl(diff)}</div>
          <div className="text-[11px] text-slate-400">Olist − sistema</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs uppercase text-slate-400">Decomposição</div>
          <div className="mt-1 text-[11px] text-slate-300">
            só Olist: <b className="text-white">{brl(somaSoOlist)}</b><br />
            só nosso: <b className="text-white">{brl(somaSoNosso)}</b><br />
            divergência: <b className="text-white">{brl(somaDiverg)}</b>
          </div>
        </div>
      </div>

      <Card className="mb-4">
        <CardContent className="p-0">
          <div className="border-b border-white/10 px-4 py-3 text-sm font-semibold text-white">
            Faturamento por VENDEDOR — Olist × Sistema (mesma canonicalização de nome)
          </div>
          <div className="overflow-x-auto"><table className="w-full text-xs">
            <thead><tr className="border-b border-white/10 text-left text-slate-400">
              <th className="px-3 py-1.5">Vendedor</th>
              <th className="px-3 py-1.5 text-right">Olist</th>
              <th className="px-3 py-1.5 text-right">Sistema</th>
              <th className="px-3 py-1.5 text-right">Diferença</th>
            </tr></thead>
            <tbody className="divide-y divide-white/5">
              {vendedores.map((v) => (
                <tr key={v.nome}>
                  <td className="px-3 py-1.5 text-white">{v.nome}</td>
                  <td className="px-3 py-1.5 text-right text-slate-300">{brl(v.olist)}</td>
                  <td className="px-3 py-1.5 text-right text-slate-300">{brl(v.nosso)}</td>
                  <td className={`px-3 py-1.5 text-right font-semibold ${Math.abs(v.diff) < 1 ? "text-emerald-400" : "text-red-400"}`}>{brl(v.diff)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardContent className="p-0">
          <div className="border-b border-white/10 px-4 py-3 text-sm font-semibold text-white">
            Pedidos no Olist que FALTAM no nosso sistema ({soNoOlist.length}) — explicam faturamento MENOR
          </div>
          <div className="overflow-x-auto"><table className="w-full text-xs">
            <thead><tr className="border-b border-white/10 text-left text-slate-400"><th className="px-3 py-1.5">Pedido</th><th className="px-3 py-1.5">Empresa</th><th className="px-3 py-1.5 text-right">Valor (Olist)</th></tr></thead>
            <tbody className="divide-y divide-white/5">
              {soNoOlist.slice(0, 60).map((o) => (<tr key={o.numero}><Cell><span className="text-violet-300">#{o.numero}</span></Cell><Cell>{o.empresa}</Cell><Cell r>{brl(o.valor)}</Cell></tr>))}
              {soNoOlist.length === 0 ? <tr><td colSpan={3} className="px-3 py-4 text-center text-slate-500">Nenhum — nosso sistema tem todos os pedidos do Olist. ✅</td></tr> : null}
            </tbody>
          </table></div>
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
            <span className="text-sm font-semibold text-white">
              Pedidos no nosso sistema que NÃO estão no Olist ({soNoNosso.length}) — explicam faturamento MAIOR (apagados/cancelados)
            </span>
            {soNoNosso.length > 0 ? <RemoverApagadosButton numeros={soNoNosso.map((o) => o.numero)} /> : null}
          </div>
          <div className="overflow-x-auto"><table className="w-full text-xs">
            <thead><tr className="border-b border-white/10 text-left text-slate-400"><th className="px-3 py-1.5">Pedido</th><th className="px-3 py-1.5">Status</th><th className="px-3 py-1.5 text-right">Valor (nosso)</th></tr></thead>
            <tbody className="divide-y divide-white/5">
              {soNoNosso.slice(0, 60).map((o) => (<tr key={o.numero}><Cell><span className="text-violet-300">#{o.numero}</span></Cell><Cell>{o.situacao || "—"}</Cell><Cell r>{brl(o.valor)}</Cell></tr>))}
              {soNoNosso.length === 0 ? <tr><td colSpan={3} className="px-3 py-4 text-center text-slate-500">Nenhum. ✅</td></tr> : null}
            </tbody>
          </table></div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="border-b border-white/10 px-4 py-3 text-sm font-semibold text-white">
            Mesmo pedido com VALOR diferente ({divergente.length}) — frete ou valor desatualizado
          </div>
          <div className="overflow-x-auto"><table className="w-full text-xs">
            <thead><tr className="border-b border-white/10 text-left text-slate-400"><th className="px-3 py-1.5">Pedido</th><th className="px-3 py-1.5 text-right">Olist</th><th className="px-3 py-1.5 text-right">Nosso</th><th className="px-3 py-1.5 text-right">Diferença</th></tr></thead>
            <tbody className="divide-y divide-white/5">
              {divergente.slice(0, 60).map((o) => (<tr key={o.numero}><Cell><span className="text-violet-300">#{o.numero}</span></Cell><Cell r>{brl(o.olist)}</Cell><Cell r>{brl(o.nosso)}</Cell><Cell r><span className="text-amber-400">{brl(o.nosso - o.olist)}</span></Cell></tr>))}
              {divergente.length === 0 ? <tr><td colSpan={4} className="px-3 py-4 text-center text-slate-500">Nenhum — todos os valores batem. ✅</td></tr> : null}
            </tbody>
          </table></div>
        </CardContent>
      </Card>
    </>
  );
  } catch (e) {
    const msg = e instanceof Error ? (e.stack ?? e.message) : String(e);
    return (
      <>
        <PageHeader title="🔎 Conferência Olist × Sistema" description="Ocorreu um erro ao montar a conferência." />
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
          <p className="mb-2 font-semibold">Erro ao gerar a conferência:</p>
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap text-xs">{msg}</pre>
        </div>
      </>
    );
  }
}
