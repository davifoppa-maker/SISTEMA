import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Table, Thead, Th, Tr, Td, EmptyState } from "@/components/ui/table";
import { SlaBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { listOrderViewsFast } from "@/lib/queries";
import { brl, dateShort } from "@/lib/utils/format";
import { CHANNEL_LABELS, type Channel } from "@/lib/types";

// Monta lista de canais únicos a partir dos pedidos reais (ordem_origem do Olist).
function buildChannelOptions(views: { order: { channel: Channel; order_origin: string | null } }[]) {
  const seen = new Map<string, string>(); // channel_code → label
  for (const v of views) {
    if (!seen.has(v.order.channel)) {
      seen.set(v.order.channel, v.order.order_origin ?? CHANNEL_LABELS[v.order.channel] ?? v.order.channel);
    }
  }
  return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1]));
}
import { RefreshTinyButton } from "@/components/refresh-tiny-button";

export const dynamic = "force-dynamic";

// Situações do pedido no Tiny (mesmos nomes das abas do ERP).
const TINY_STATUSES = [
  "em aberto",
  "aprovado",
  "preparando envio",
  "faturado",
  "pronto para envio",
  "enviado",
  "entregue",
  "cancelado",
];

// Cores espelhando as abas do Olist Tiny.
const STATUS_STYLE: Record<string, string> = {
  "em aberto": "bg-amber-100 text-amber-800",
  "aprovado": "bg-emerald-100 text-emerald-700",
  "preparando envio": "bg-teal-100 text-teal-700",
  "faturado": "bg-blue-100 text-blue-700",
  "pronto para envio": "bg-orange-100 text-orange-700",
  "enviado": "bg-indigo-100 text-indigo-700",
  "entregue": "bg-green-100 text-green-700",
  "cancelado": "bg-rose-100 text-rose-700",
  "dados incompletos": "bg-slate-100 text-slate-600",
  "não entregue": "bg-red-100 text-red-700",
};

function StatusPill({ status }: { status: string | null }) {
  const key = (status ?? "").toLowerCase();
  const cls = STATUS_STYLE[key] ?? "bg-slate-100 text-slate-600";
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${cls}`}>
      {status ?? "—"}
    </span>
  );
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: { q?: string; channel?: string; status?: string };
}) {
  const q = (searchParams.q ?? "").toLowerCase();
  const channel = searchParams.channel ?? "";
  const status = searchParams.status ?? "";

  const allViews = await listOrderViewsFast();
  const channelOptions = buildChannelOptions(allViews);
  let views = allViews;
  if (q) {
    views = views.filter(
      (v) =>
        v.order.order_number.toLowerCase().includes(q) ||
        (v.order.external_order_number ?? "").toLowerCase().includes(q) ||
        v.customerName.toLowerCase().includes(q) ||
        (v.customerDoc ?? "").toLowerCase().includes(q) ||
        (v.invoiceNumber ?? "").toLowerCase().includes(q),
    );
  }
  if (channel) views = views.filter((v) => v.order.channel === channel);
  if (status) views = views.filter((v) => v.order.tiny_status === status);

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <PageHeader
          title="Pedidos"
          description="Pedidos importados do Tiny — busca, filtros e status logístico real."
        />
        <div className="pt-1">
          <RefreshTinyButton label="Atualizar pedidos (Tiny)" />
        </div>
      </div>

      <Card className="mb-4">
        <CardContent>
          <form className="flex flex-wrap items-end gap-3" method="get">
            <div className="flex-1 min-w-[220px]">
              <label className="mb-1 block text-xs font-medium text-slate-600">Buscar</label>
              <input
                name="q"
                defaultValue={searchParams.q}
                placeholder="Pedido, NF, cliente, CNPJ, nº externo…"
                className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-brand-600"
              />
            </div>
            <div className="min-w-[160px]">
              <label className="mb-1 block text-xs font-medium text-slate-600">Canal</label>
              <select name="channel" defaultValue={channel} className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm">
                <option value="">Todos</option>
                {channelOptions.map(([code, label]) => (
                  <option key={code} value={code}>{label}</option>
                ))}
              </select>
            </div>
            <div className="min-w-[180px]">
              <label className="mb-1 block text-xs font-medium text-slate-600">Status</label>
              <select name="status" defaultValue={status} className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm">
                <option value="">Todos</option>
                {TINY_STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <button className="h-10 rounded-lg bg-brand-700 px-4 text-sm font-medium text-white hover:bg-brand-800">
              Filtrar
            </button>
            <Link href="/orders" className="h-10 rounded-lg border border-slate-300 px-4 text-sm font-medium leading-10 text-slate-600 hover:bg-slate-50">
              Limpar
            </Link>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <Thead>
              <tr>
                <Th>Pedido</Th>
                <Th>Nº externo</Th>
                <Th>Canal</Th>
                <Th>Cliente</Th>
                <Th>Cidade/UF</Th>
                <Th className="text-right">Valor</Th>
                <Th>NF</Th>
                <Th>Transportadora</Th>
                <Th>Status</Th>
                <Th>SLA</Th>
                <Th>Previsão</Th>
              </tr>
            </Thead>
            <tbody>
              {views.map((v) => (
                <Tr key={v.order.id}>
                  <Td>
                    <Link href={`/orders/${v.order.id}`} className="font-medium text-brand-700 hover:underline">
                      #{v.order.order_number}
                    </Link>
                  </Td>
                  <Td className="text-slate-500">{v.order.external_order_number ?? "—"}</Td>
                  <Td><Badge variant={v.order.channel === "b2b_mercos" ? "info" : "muted"}>{v.order.order_origin ?? CHANNEL_LABELS[v.order.channel]}</Badge></Td>
                  <Td className="max-w-[180px] truncate">{v.customerName}</Td>
                  <Td className="text-slate-500">{v.order.city ? `${v.order.city}/${v.order.state}` : "—"}</Td>
                  <Td className="text-right">{brl(v.order.total_value)}</Td>
                  <Td className="text-slate-500">{v.invoiceNumber ?? "—"}</Td>
                  <Td className="text-slate-500">{v.carrierName ?? "—"}</Td>
                  <Td><StatusPill status={v.order.tiny_status} /></Td>
                  <Td>{v.slaStatus ? <SlaBadge status={v.slaStatus} /> : "—"}</Td>
                  <Td className="text-slate-500">{dateShort(v.estimatedDelivery)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          {views.length === 0 ? <EmptyState message="Nenhum pedido encontrado para os filtros." /> : null}
        </CardContent>
      </Card>
    </>
  );
}
