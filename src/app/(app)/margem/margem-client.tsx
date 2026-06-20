"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { brl } from "@/lib/utils/format";
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  Receipt,
  Percent,
  Truck,
  Package,
  ChevronDown,
} from "lucide-react";

interface OrderItem {
  id: string;
  sku: string;
  description: string;
  quantity: number;
  unit_value: number;
}

interface OrderOption {
  id: string;
  order_number: string;
  customer_name: string;
  total_value: number;
  freight_value: number;
  items: OrderItem[];
}

interface Props {
  orders: OrderOption[];
}

const DEFAULT_TAX_RATE = 15;
const DEFAULT_COMMISSION_RATE = 10;
const DEFAULT_LOGISTICS_RATE = 3;
const DEFAULT_MIN_MARGIN = 20;

export function MargemClient({ orders }: Props) {
  const [selectedOrderId, setSelectedOrderId] = useState<string>(orders[0]?.id ?? "");
  const [taxRate, setTaxRate] = useState(DEFAULT_TAX_RATE);
  const [commissionRate, setCommissionRate] = useState(DEFAULT_COMMISSION_RATE);
  const [logisticsRate, setLogisticsRate] = useState(DEFAULT_LOGISTICS_RATE);
  const [minMargin, setMinMargin] = useState(DEFAULT_MIN_MARGIN);
  const [productCostPct, setProductCostPct] = useState(40);

  const order = useMemo(
    () => orders.find((o) => o.id === selectedOrderId) ?? null,
    [orders, selectedOrderId],
  );

  const calc = useMemo(() => {
    if (!order) return null;
    const revenue = order.total_value;
    const taxes = (taxRate / 100) * revenue;
    const commission = (commissionRate / 100) * revenue;
    const logistics = (logisticsRate / 100) * revenue;
    const productCost = (productCostPct / 100) * revenue;
    const totalCosts = taxes + commission + logistics + productCost;
    const profit = revenue - totalCosts;
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
    return { revenue, taxes, commission, logistics, productCost, totalCosts, profit, margin };
  }, [order, taxRate, commissionRate, logisticsRate, productCostPct]);

  const isValid = calc ? calc.margin >= minMargin : false;

  return (
    <div className="space-y-6">
      {/* Seleção do pedido */}
      <Card>
        <CardContent className="pt-5">
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Pedido</label>
          <div className="relative">
            <select
              value={selectedOrderId}
              onChange={(e) => setSelectedOrderId(e.target.value)}
              className="h-11 w-full appearance-none rounded-lg border border-slate-300 bg-white px-4 pr-10 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
            >
              {orders.map((o) => (
                <option key={o.id} value={o.id}>
                  #{o.order_number} — {o.customer_name} — {brl(o.total_value)}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          </div>
        </CardContent>
      </Card>

      {order && calc && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Parâmetros */}
          <Card>
            <CardHeader>
              <CardTitle>Parâmetros</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <RateInput label="Impostos (%)" value={taxRate} onChange={setTaxRate} />
              <RateInput label="Comissão (%)" value={commissionRate} onChange={setCommissionRate} />
              <RateInput label="Logística (%)" value={logisticsRate} onChange={setLogisticsRate} />
              <RateInput label="Custo de produtos (%)" value={productCostPct} onChange={setProductCostPct} />
              <div className="border-t border-slate-100 pt-4">
                <RateInput
                  label="Margem mínima exigida (%)"
                  value={minMargin}
                  onChange={setMinMargin}
                  accent
                />
              </div>
            </CardContent>
          </Card>

          {/* Composição de custos */}
          <Card>
            <CardHeader>
              <CardTitle>Composição de Custos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <CostRow
                label={`Impostos (${taxRate}%)`}
                value={calc.taxes}
                icon={Receipt}
                color="text-amber-600"
                bg="bg-amber-50"
              />
              <CostRow
                label={`Comissão (${commissionRate}%)`}
                value={calc.commission}
                icon={Percent}
                color="text-blue-600"
                bg="bg-blue-50"
              />
              <CostRow
                label={`Logística (${logisticsRate}%)`}
                value={calc.logistics}
                icon={Truck}
                color="text-purple-600"
                bg="bg-purple-50"
              />
              <CostRow
                label={`Custo Produtos (${productCostPct}%)`}
                value={calc.productCost}
                icon={Package}
                color="text-slate-600"
                bg="bg-slate-50"
              />
              <div className="border-t border-slate-100 pt-3">
                <div className="flex justify-between text-sm">
                  <span className="font-medium text-slate-600">Total de custos:</span>
                  <span className="font-bold text-slate-800">{brl(calc.totalCosts)}</span>
                </div>
                <div className="mt-1 flex justify-between text-sm">
                  <span className="font-medium text-slate-600">Receita bruta:</span>
                  <span className="font-bold text-slate-800">{brl(calc.revenue)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Indicador de margem */}
          <div
            className={`rounded-2xl border-2 p-6 transition-all duration-300 ${
              isValid
                ? "border-emerald-200 bg-gradient-to-br from-emerald-50 to-green-50"
                : "border-red-200 bg-gradient-to-br from-red-50 to-rose-50"
            }`}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-700">Margem de Contribuição</h3>
              {isValid ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-red-500" />
              )}
            </div>

            <div className="mb-4 flex items-end gap-2">
              <span
                className={`text-5xl font-bold ${isValid ? "text-emerald-600" : "text-red-600"}`}
              >
                {calc.margin.toFixed(1)}%
              </span>
              <span className="mb-1 text-slate-500">atual</span>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Mínimo exigido:</span>
                <span className="font-semibold text-slate-800">{minMargin}%</span>
              </div>

              <div className="h-3 overflow-hidden rounded-full bg-slate-200">
                <div
                  style={{ width: `${Math.min(100, (calc.margin / minMargin) * 100)}%` }}
                  className={`h-full rounded-full transition-all duration-500 ${
                    isValid
                      ? "bg-gradient-to-r from-emerald-400 to-green-500"
                      : "bg-gradient-to-r from-red-400 to-rose-500"
                  }`}
                />
              </div>

              <div className="flex items-center gap-2 text-sm">
                {isValid ? (
                  <>
                    <TrendingUp className="h-4 w-4 text-emerald-500" />
                    <span className="font-medium text-emerald-600">
                      +{(calc.margin - minMargin).toFixed(1)}% acima do mínimo
                    </span>
                  </>
                ) : (
                  <>
                    <TrendingDown className="h-4 w-4 text-red-500" />
                    <span className="font-medium text-red-600">
                      {(calc.margin - minMargin).toFixed(1)}% abaixo do mínimo
                    </span>
                  </>
                )}
              </div>

              <div className="mt-4 space-y-2 border-t border-slate-200 pt-4">
                <div className="flex justify-between rounded-lg border-2 border-emerald-200 bg-emerald-50 p-3">
                  <span className="font-medium text-slate-600">Lucro do pedido:</span>
                  <span className="font-bold text-emerald-600">{brl(calc.profit)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Total do pedido:</span>
                  <span className="font-bold text-slate-800">{brl(calc.revenue)}</span>
                </div>
              </div>
            </div>

            {!isValid && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-100 p-4">
                <p className="text-sm font-medium text-red-700">
                  ⚠️ Margem atual: {calc.margin.toFixed(1)}%
                </p>
                <p className="mt-1 text-sm text-red-600">
                  Mínimo exigido: {minMargin}%
                </p>
                <p className="mt-2 text-xs text-red-500">
                  Ajuste os parâmetros ou negocie o pedido para atingir a margem mínima.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Itens do pedido */}
      {order && order.items.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Itens do Pedido #{order.order_number}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-xs font-medium text-slate-500">
                  <th className="px-4 py-3 text-left">SKU</th>
                  <th className="px-4 py-3 text-left">Descrição</th>
                  <th className="px-4 py-3 text-right">Qtd</th>
                  <th className="px-4 py-3 text-right">Valor unit.</th>
                  <th className="px-4 py-3 text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item) => (
                  <tr key={item.id} className="border-b border-slate-50 last:border-0">
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{item.sku}</td>
                    <td className="px-4 py-3 text-slate-800">{item.description}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{item.quantity}</td>
                    <td className="px-4 py-3 text-right text-slate-700">
                      {brl(item.unit_value)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-800">
                      {brl(item.unit_value * item.quantity)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50">
                  <td colSpan={4} className="px-4 py-3 text-right text-sm font-medium text-slate-600">
                    Total:
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-slate-800">
                    {brl(order.total_value)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function RateInput({
  label,
  value,
  onChange,
  accent = false,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  accent?: boolean;
}) {
  return (
    <div>
      <label className={`mb-1 block text-xs font-medium ${accent ? "text-brand-700" : "text-slate-600"}`}>
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={0}
          max={100}
          step={0.5}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-2 flex-1 cursor-pointer accent-brand-600"
        />
        <span className={`w-12 text-right text-sm font-semibold ${accent ? "text-brand-700" : "text-slate-700"}`}>
          {value}%
        </span>
      </div>
    </div>
  );
}

function CostRow({
  label,
  value,
  icon: Icon,
  color,
  bg,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  color: string;
  bg: string;
}) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <div className="flex items-center gap-3">
        <div className={`rounded-lg p-2 ${bg}`}>
          <Icon className={`h-4 w-4 ${color}`} />
        </div>
        <span className="text-sm text-slate-600">{label}</span>
      </div>
      <span className="font-medium text-slate-800">-{brl(value)}</span>
    </div>
  );
}
