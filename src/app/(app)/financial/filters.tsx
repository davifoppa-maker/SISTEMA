"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

export function FinancialFilters({ mes }: { mes: string }) {
  const router = useRouter();
  const params = useSearchParams();

  const update = useCallback((key: string, value: string) => {
    const sp = new URLSearchParams(params.toString());
    if (value) sp.set(key, value);
    else sp.delete(key);
    router.push(`/financial?${sp.toString()}`);
  }, [params, router]);

  const input =
    "h-9 rounded-lg border border-slate-300 px-2 text-sm text-slate-700 focus:border-brand-600 focus:outline-none";

  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-slate-500">Cliente</span>
        <input
          type="text"
          placeholder="Buscar cliente..."
          defaultValue={params.get("q") ?? ""}
          onBlur={(e) => update("q", e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && update("q", (e.target as HTMLInputElement).value)}
          className={`${input} w-48`}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-slate-500">Emissão de</span>
        <input
          type="date"
          defaultValue={params.get("emissao_de") ?? ""}
          onChange={(e) => update("emissao_de", e.target.value)}
          className={input}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-slate-500">Emissão até</span>
        <input
          type="date"
          defaultValue={params.get("emissao_ate") ?? ""}
          onChange={(e) => update("emissao_ate", e.target.value)}
          className={input}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-slate-500">Vencimento de</span>
        <input
          type="date"
          defaultValue={params.get("venc_de") ?? ""}
          onChange={(e) => update("venc_de", e.target.value)}
          className={input}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-slate-500">Vencimento até</span>
        <input
          type="date"
          defaultValue={params.get("venc_ate") ?? ""}
          onChange={(e) => update("venc_ate", e.target.value)}
          className={input}
        />
      </label>
    </div>
  );
}
