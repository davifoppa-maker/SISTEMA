"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
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
  BarChart2,
  Menu,
  X,
} from "lucide-react";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  {
    href: "/orders",
    label: "Pedidos",
    icon: Package,
    children: [
      { href: "/orders", label: "Todos os pedidos" },
      { href: "/orders/margem", label: "Margem de pedidos" },
      { href: "/orders/lancar", label: "Lançar pedido (IA)" },
    ],
  },
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
      { href: "/financial/caixa", label: "Caixa" },
    ],
  },
  { href: "/whatsapp", label: "WhatsApp", icon: MessageCircle },
  { href: "/quotes", label: "Cotação manual", icon: Calculator },
  { href: "/margem", label: "Gestor de Margem", icon: BarChart2 },
  { href: "/settings", label: "Configurações", icon: Settings },
];

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.push("/login");
    router.refresh();
  }

  return (
    <>
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
                  onClick={onNavigate}
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
                          onClick={onNavigate}
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
              onClick={onNavigate}
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
    </>
  );
}

export function Sidebar() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed left-4 top-4 z-40 flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white shadow-md md:hidden"
        aria-label="Abrir menu"
      >
        <Menu className="h-5 w-5 text-slate-600" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-slate-200 bg-white transition-transform duration-300 md:hidden",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <button
          onClick={() => setOpen(false)}
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"
          aria-label="Fechar menu"
        >
          <X className="h-4 w-4" />
        </button>
        <SidebarContent onNavigate={() => setOpen(false)} />
      </aside>

      <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
        <SidebarContent />
      </aside>
    </>
  );
}
