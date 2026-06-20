"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import {
  LayoutDashboard,
  Package,
  ScanLine,
  Boxes,
  AlertTriangle,
  MessageCircle,
  Calculator,
  TrendingUp,
  Settings,
  LogOut,
} from "lucide-react";

// Menu de OPERAÇÕES, enxuto. Transportadoras, Payload bruto/Webhooks e Clientes
// ficam dentro de Configurações; os dados/rotas continuam existindo.
const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/orders", label: "Pedidos", icon: Package },
  { href: "/checkout", label: "Checkout expedição", icon: ScanLine },
  { href: "/batches", label: "Lotes de coleta", icon: Boxes },
  { href: "/occurrences", label: "Ocorrências", icon: AlertTriangle },
  { href: "/whatsapp", label: "WhatsApp", icon: MessageCircle },
  { href: "/quotes", label: "Cotação manual", icon: Calculator },
  { href: "/margem", label: "Gestor de Margem", icon: TrendingUp },
  { href: "/settings", label: "Configurações", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="flex h-16 items-center gap-2 border-b border-slate-100 px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-700 text-sm font-bold text-white">
          Ex
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold text-slate-800">Pós Venda Exx</div>
          <div className="text-[10px] text-slate-400">Logística & Pós-venda</div>
        </div>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {nav.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active ? "bg-brand-50 text-brand-800" : "text-slate-600 hover:bg-slate-100",
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-slate-100 p-3">
        <button
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100"
        >
          <LogOut className="h-4 w-4" />
          Sair
        </button>
      </div>
    </aside>
  );
}
