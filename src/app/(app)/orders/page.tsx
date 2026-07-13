import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Table, Thead, Th, Tr, Td, EmptyState } from "@/components/ui/table";
import { SlaBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { listOrderViewsFast } from "@/lib/queries";
import { buildSellerCanonicalizer } from "@/lib/seller";
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
  searchParams: { q?: string; channel?: string; status?: string; empresa?: string; vendedor?: string; ordem?: string; de?: string; ate?: string };
}) {
  const q = (searchParams.q ?? "").toLowerCase();
  const channel = searchParams.channel ?? "";
  const status = searchParams.status ?? "";
  const empresa = searchParams.empresa ?? "";
  const vendedor = searchParams.vendedor ?? "";
  const de = searchParams.de ?? "";   // data inicial (YYYY-MM-DD)
  const ate = searchParams.ate ?? ""; // data final (YYYY-MM-DD)
  const ordem = searchParams.ordem === "asc" ? "asc" : "desc"; // padrão: mais recente primeiro

  // Data válida = ano plausível (2015–2030). Descarta datas quebradas (ex.: 2096).
  const dataValida = (d: string | null | undefined): string => {
    if (!d) return "";
    const ano = Number(String(d).slice(0, 4));
    return ano >= 2015 && ano <= 2030 ? String(d) : "";
  };

  const allViews = await listOrderViewsFast();
  const channelOptions = buildChannelOptions(allViews);
  // Vendedores (nomes unificados) para o filtro.
  const sellerOf = buildSellerCanonicalizer(allViews.map((v) => v.order.seller));
  const vendedorOptions = [...new Set(allViews.map((v) => sellerOf(v.order.seller)))].sort((a, b) => a.localeCompare(b));
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
  if (empresa) views = views.filter((v) => ((v.order as any).empresa ?? "nyer") === empresa);
  if (vendedor) views = views.filter((v) => sellerOf(v.order.seller) === vendedor);
  // Filtro por período (data do pedido, YYYY-MM-DD).
  if (de) views = views.filter((v) => (v.order.order_date ?? "").slice(0, 10) >= de);
  if (ate) views = views.filter((v) => (v.order.order_date ?? "").slice(0, 10) <= ate);

  // Ordena pela DATA do pedido (padrão decrescente; clique alterna). Datas
  // inválidas vão para o fim; empate cai pelo número do pedido.
  const dir = ordem === "asc" ? 1 : -1;
  views = [...views].sort((a, b) => {
    const da = dataValida(a.order.order_date);
    const db = dataValida(b.order.order_date);
    if (da !== db) {
      if (!da) return 1; // sem data válida → sempre por último
      if (!db) return -1;
      return da.localeCompare(db) * dir;
    }
    const na = Number(a.order.order_number);
    const nb = Number(b.order.order_number);
    if (Number.isFinite(na) && Number.isFinite(nb)) return (na - nb) * dir;
    return a.order.order_number.localeCompare(b.order.order_number) * dir;
  });

  // Link para alternar a ordenação preservando os filtros atuais.
  const qs = (o: string) => {
    const p = new URLSearchParams();
    if (q) p.set("q", searchParams.q ?? "");
    if (channel) p.set("channel", channel);
    if (status) p.set("status", status);
    if (empresa) p.set("empresa", empresa);
    if (vendedor) p.set("vendedor", vendedor);
    if (de) p.set("de", de);
    if (ate) p.set("ate", ate);
    p.set("ordem", o);
    return `/orders?${p.toString()}`;
  };
  const proximaOrdem = ordem === "asc" ? "desc" : "asc";

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
            <div className="min-w-[140px]">
              <label className="mb-1 block text-xs font-medium text-slate-600">De (data)</label>
              <input type="date" name="de" defaultValue={de} className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-brand-600" />
            </div>
            <div className="min-w-[140px]">
              <label className="mb-1 block text-xs font-medium text-slate-600">Até (data)</label>
              <input type="date" name="ate" defaultValue={ate} className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-brand-600" />
            </div>
            <div className="flex-1 min-w-[220px]">
              <label className="mb-1 block text-xs font-medium text-slate-600">Buscar</label>
              <input
                name="q"
                defaultValue={searchParams.q}
                placeholder="Pedido, NF, cliente, CNPJ, nº externo…"
                className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-brand-600"
              />
            </div>
            <div className="min-w-[140px]">
              <label className="mb-1 block text-xs font-medium text-slate-600">Empresa</label>
              <select name="empresa" defaultValue={empresa} className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm">
                <option value="">Todas</option>
                <option value="nyer">NYER</option>
                <option value="ecopro">Ecopro</option>
              </select>
            </div>
            <div className="min-w-[180px]">
              <label className="mb-1 block text-xs font-medium text-slate-600">Vendedor</label>
              <select name="vendedor" defaultValue={vendedor} className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm">
                <option value="">Todos</option>
                {vendedorOptions.map((nome) => (
                  <option key={nome} value={nome}>{nome}</option>
                ))}
              </select>
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
                <Th>Vendedor</Th>
                <Th>Empresa</Th>
                <Th>Cliente</Th>
                <Th>
                  <Link href={qs(proximaOrdem)} className="inline-flex items-center gap-1 hover:text-brand-600">
                    Data {ordem === "asc" ? "▲" : "▼"}
                  </Link>
                </Th>
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
                  <Td className="text-slate-500">{sellerOf(v.order.seller)}</Td>
                  <Td>
                    <Badge variant={(v.order as any).empresa === "ecopro" ? "muted" : "info"}>
                      {(v.order as any).empresa === "ecopro" ? "Ecopro" : "NRX"}
                    </Badge>
                  </Td>
                  <Td className="max-w-[180px] truncate">{v.customerName}</Td>
                  <Td className="text-slate-500">{dataValida(v.order.order_date) ? dateShort(v.order.order_date) : "—"}</Td>
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
