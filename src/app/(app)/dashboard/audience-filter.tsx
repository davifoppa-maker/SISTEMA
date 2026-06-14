"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { Audience } from "@/lib/services/dashboard";

// Filtro de público do dashboard (B2B/B2C), no canto superior direito.
// Padrão B2B; troca via querystring (?audience=).
export function AudienceFilter({ current }: { current: Audience }) {
  const router = useRouter();
  const params = useSearchParams();

  function setAudience(a: Audience) {
    const sp = new URLSearchParams(params.toString());
    sp.set("audience", a);
    router.push(`/dashboard?${sp.toString()}`);
  }

  const opts: { key: Audience; label: string }[] = [
    { key: "b2b", label: "B2B" },
    { key: "b2c", label: "B2C" },
  ];

  return (
    <div className="inline-flex overflow-hidden rounded-lg border border-slate-300">
      {opts.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => setAudience(o.key)}
          className={
            "px-4 py-2 text-sm font-medium transition-colors " +
            (current === o.key ? "bg-brand-700 text-white" : "bg-white text-slate-600 hover:bg-slate-50")
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
