import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { loadStoreFor } from "@/lib/db";
import { ehCancelado } from "@/lib/pedido";
import { brl } from "@/lib/utils/format";
import type { DataStore } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const norm = (s: string | null | undefined) =>
  String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\D/g, "");
const normNome = (s: string | null | undefined) =>
  String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

export default async function DuplicadosPage() {
  const store = await loadStoreFor(["orders", "order_items", "customers"] as Array<keyof DataStore>);

  const emp = (o: any) => (o.empresa ?? "nyer");

  // 1) Pedidos com o MESMO número na MESMA empresa (duplicata real).
  const porNumero = new Map<string, typeof store.orders>();
  for (const o of store.orders) {
    if (o.source !== "tiny") continue;
    const k = `${emp(o)}::${o.order_number}`;
    if (!porNumero.has(k)) porNumero.set(k, [] as any);
    porNumero.get(k)!.push(o);
  }
  const dupNumero = [...porNumero.entries()].filter(([, arr]) => arr.length > 1)
    .map(([k, arr]) => ({ k, arr }))
    .sort((a, b) => b.arr.length - a.arr.length);

  // 2) Pedidos com o MESMO tiny_id (nunca deveria repetir).
  const porTinyId = new Map<string, typeof store.orders>();
  for (const o of store.orders) {
    if (!o.tiny_id) continue;
    const k = `${emp(o)}::${o.tiny_id}`;
    if (!porTinyId.has(k)) porTinyId.set(k, [] as any);
    porTinyId.get(k)!.push(o);
  }
  const dupTiny = [...porTinyId.entries()].filter(([, arr]) => arr.length > 1).map(([k, arr]) => ({ k, arr }));

  // 3) Itens duplicados dentro do mesmo pedido (mesmo sku repetido).
  const itensPorPedido = new Map<string, Map<string, number>>();
  for (const it of store.order_items) {
    if (!itensPorPedido.has(it.order_id)) itensPorPedido.set(it.order_id, new Map());
    const m = itensPorPedido.get(it.order_id)!;
    const sku = it.sku ?? "—";
    m.set(sku, (m.get(sku) ?? 0) + 1);
  }
  const pedidosComItemDup = [...itensPorPedido.entries()]
    .filter(([, m]) => [...m.values()].some((n) => n > 1))
    .map(([orderId, m]) => {
      const o = store.orders.find((x) => x.id === orderId);
      const repetidos = [...m.entries()].filter(([, n]) => n > 1);
      return { numero: o?.order_number ?? orderId, repetidos };
    }).slice(0, 60);

  // 4) Clientes duplicados por documento (CNPJ/CPF) e por nome.
  const porDoc = new Map<string, typeof store.customers>();
  for (const c of store.customers) {
    const d = norm(c.document);
    if (d.length < 8) continue;
    if (!porDoc.has(d)) porDoc.set(d, [] as any);
    porDoc.get(d)!.push(c);
  }
  const dupDoc = [...porDoc.entries()].filter(([, arr]) => arr.length > 1).map(([d, arr]) => ({ d, arr })).slice(0, 60);

  const porNome = new Map<string, typeof store.customers>();
  for (const c of store.customers) {
    const n = normNome(c.name);
    if (!n) continue;
    if (!porNome.has(n)) porNome.set(n, [] as any);
    porNome.get(n)!.push(c);
  }
  const dupNome = [...porNome.entries()].filter(([, arr]) => arr.length > 1).map(([n, arr]) => ({ n, arr })).slice(0, 60);

  // Impacto no faturamento: soma dos valores das cópias EXTRAS (não-canceladas).
  const impactoNumero = dupNumero.reduce((s, { arr }) => {
    const extras = arr.filter((o) => !ehCancelado(o.tiny_status)).slice(1);
    return s + extras.reduce((ss, o) => ss + (o.total_value ?? 0), 0);
  }, 0);

  const Kpi = ({ label, value, alerta }: { label: string; value: string; alerta?: boolean }) => (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="text-xs uppercase text-slate-400">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${alerta ? "text-red-400" : "text-white"}`}>{value}</div>
    </div>
  );

  return (
    <>
      <PageHeader title="🧹 Pente-fino de duplicados" description="Pedidos e clientes repetidos que inflam faturamento e carteira." />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Pedidos duplicados (nº)" value={String(dupNumero.length)} alerta={dupNumero.length > 0} />
        <Kpi label="Impacto no faturamento" value={brl(impactoNumero)} alerta={impactoNumero > 0} />
        <Kpi label="Clientes dup. (CNPJ)" value={String(dupDoc.length)} alerta={dupDoc.length > 0} />
        <Kpi label="Clientes dup. (nome)" value={String(dupNome.length)} alerta={dupNome.length > 0} />
      </div>

      <Card className="mb-4">
        <CardContent className="p-0">
          <div className="border-b border-white/10 px-4 py-3 text-sm font-semibold text-white">
            Pedidos com o MESMO número/empresa ({dupNumero.length}) — contados em duplicidade no faturamento
          </div>
          <div className="overflow-x-auto"><table className="w-full text-xs">
            <thead><tr className="border-b border-white/10 text-left text-slate-400"><th className="px-3 py-1.5">Pedido</th><th className="px-3 py-1.5">Empresa</th><th className="px-3 py-1.5 text-right">Cópias</th><th className="px-3 py-1.5">Status</th><th className="px-3 py-1.5 text-right">Valor (cada)</th></tr></thead>
            <tbody className="divide-y divide-white/5">
              {dupNumero.slice(0, 60).map(({ k, arr }) => {
                const [empKey, num] = k.split("::");
                return (
                  <tr key={k}>
                    <td className="px-3 py-1.5 text-violet-300">#{num}</td>
                    <td className="px-3 py-1.5">{empKey}</td>
                    <td className="px-3 py-1.5 text-right text-red-400 font-semibold">{arr.length}</td>
                    <td className="px-3 py-1.5 text-slate-400">{arr.map((o) => o.tiny_status ?? "—").join(" / ")}</td>
                    <td className="px-3 py-1.5 text-right">{brl(arr[0].total_value ?? 0)}</td>
                  </tr>
                );
              })}
              {dupNumero.length === 0 ? <tr><td colSpan={5} className="px-3 py-4 text-center text-slate-500">Nenhum pedido duplicado por número. ✅</td></tr> : null}
            </tbody>
          </table></div>
        </CardContent>
      </Card>

      {dupTiny.length > 0 ? (
        <Card className="mb-4">
          <CardContent className="p-0">
            <div className="border-b border-white/10 px-4 py-3 text-sm font-semibold text-white">Pedidos com o MESMO tiny_id ({dupTiny.length})</div>
            <div className="overflow-x-auto"><table className="w-full text-xs">
              <thead><tr className="border-b border-white/10 text-left text-slate-400"><th className="px-3 py-1.5">tiny_id</th><th className="px-3 py-1.5 text-right">Cópias</th><th className="px-3 py-1.5">Números</th></tr></thead>
              <tbody className="divide-y divide-white/5">
                {dupTiny.slice(0, 40).map(({ k, arr }) => (<tr key={k}><td className="px-3 py-1.5">{k.split("::")[1]}</td><td className="px-3 py-1.5 text-right text-red-400">{arr.length}</td><td className="px-3 py-1.5 text-slate-400">{arr.map((o) => o.order_number).join(", ")}</td></tr>))}
              </tbody>
            </table></div>
          </CardContent>
        </Card>
      ) : null}

      <Card className="mb-4">
        <CardContent className="p-0">
          <div className="border-b border-white/10 px-4 py-3 text-sm font-semibold text-white">Clientes duplicados por CNPJ/CPF ({dupDoc.length}) — inflam a carteira/positivação</div>
          <div className="overflow-x-auto"><table className="w-full text-xs">
            <thead><tr className="border-b border-white/10 text-left text-slate-400"><th className="px-3 py-1.5">Documento</th><th className="px-3 py-1.5 text-right">Cadastros</th><th className="px-3 py-1.5">Nomes</th></tr></thead>
            <tbody className="divide-y divide-white/5">
              {dupDoc.slice(0, 60).map(({ d, arr }) => (<tr key={d}><td className="px-3 py-1.5">{arr[0].document ?? d}</td><td className="px-3 py-1.5 text-right text-red-400">{arr.length}</td><td className="px-3 py-1.5 text-slate-300">{arr.map((c) => c.name).join(" | ")}</td></tr>))}
              {dupDoc.length === 0 ? <tr><td colSpan={3} className="px-3 py-4 text-center text-slate-500">Nenhum. ✅</td></tr> : null}
            </tbody>
          </table></div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="border-b border-white/10 px-4 py-3 text-sm font-semibold text-white">Itens repetidos dentro do mesmo pedido ({pedidosComItemDup.length})</div>
          <div className="overflow-x-auto"><table className="w-full text-xs">
            <thead><tr className="border-b border-white/10 text-left text-slate-400"><th className="px-3 py-1.5">Pedido</th><th className="px-3 py-1.5">SKU (nº de vezes)</th></tr></thead>
            <tbody className="divide-y divide-white/5">
              {pedidosComItemDup.map((p) => (<tr key={p.numero}><td className="px-3 py-1.5 text-violet-300">#{p.numero}</td><td className="px-3 py-1.5 text-slate-300">{p.repetidos.map(([sku, n]) => `${sku} (${n}×)`).join(", ")}</td></tr>))}
              {pedidosComItemDup.length === 0 ? <tr><td colSpan={2} className="px-3 py-4 text-center text-slate-500">Nenhum. ✅</td></tr> : null}
            </tbody>
          </table></div>
        </CardContent>
      </Card>
    </>
  );
}
