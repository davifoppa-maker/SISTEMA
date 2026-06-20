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
  Settings,
  LogOut,
  TrendingUp,
  ChevronDown,
} from "lucide-react";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/orders", label: "Pedidos", icon: Package },
  { href: "/checkout", label: "Checkout expedição", icon: ScanLine },
  { href: "/batches", label: "Lotes de coleta", icon: Boxes },
  { href: "/occurrences", label: "Ocorrências", icon: AlertTriangle },
  {
    href: "/financial",
    label: "Financeiro",
    icon: TrendingUp,
    children: [
      { href: "/financial/dashboard", label: "Dashboard" },
      { href: "/financial", label: "Contas a receber" },
      { href: "/financial/payable", label: "Contas a pagar" },
    ],
  },
  { href: "/whatsapp", label: "WhatsApp", icon: MessageCircle },
  { href: "/quotes", label: "Cotação manual", icon: Calculator },
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
          N
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold text-slate-800">NYER APP</div>
          <div className="text-[10px] text-slate-400">Logística & Pós-venda</div>
        </div>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {nav.map((item) => {
          const Icon = item.icon;
          const parentActive = pathname === item.href || pathname.startsWith(item.href + "/");

          if (item.children) {
            return (
              <div key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    parentActive ? "bg-brand-50 text-brand-800" : "text-slate-600 hover:bg-slate-100",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span className="flex-1">{item.label}</span>
                  <ChevronDown className={cn("h-3 w-3 transition-transform", parentActive && "rotate-180")} />
                </Link>
                {parentActive && (
                  <div className="ml-4 mt-1 space-y-1 border-l border-slate-100 pl-3">
                    {item.children.map((child) => {
                      const childActive = pathname === child.href;
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          className={cn(
                            "block rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                            childActive ? "text-brand-700" : "text-slate-500 hover:text-slate-800",
                          )}
                        >
                          {child.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          const active = pathname === item.href || pathname.startsWith(item.href + "/");
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
