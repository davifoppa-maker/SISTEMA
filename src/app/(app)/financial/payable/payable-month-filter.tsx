"use client";

import { useRouter } from "next/navigation";

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export function PayableMonthFilter({ value }: { value: string }) {
  const router = useRouter();
  const [year, month] = value.split("-").map(Number);

  function update(y: number, m: number) {
    const v = `${y}-${String(m).padStart(2, "0")}`;
    router.push(`/financial/payable?mes=${v}`);
  }

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 4 }, (_, i) => currentYear - i);

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium text-slate-600">Mês:</span>
      <select
        value={month}
        onChange={(e) => update(year, Number(e.target.value))}
        className="h-9 rounded-lg border border-slate-300 px-2 text-sm text-slate-700 focus:border-brand-600 focus:outline-none"
      >
        {MONTHS.map((m, i) => (
          <option key={i + 1} value={i + 1}>{m}</option>
        ))}
      </select>
      <select
        value={year}
        onChange={(e) => update(Number(e.target.value), month)}
        className="h-9 rounded-lg border border-slate-300 px-2 text-sm text-slate-700 focus:border-brand-600 focus:outline-none"
      >
        {years.map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>
    </div>
  );
}
