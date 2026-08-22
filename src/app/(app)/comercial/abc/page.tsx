import ComercialPage from "../page";

export const dynamic = "force-dynamic";

// Curva ABC (clientes × produtos): mesma página do dashboard, nessa visão.
export default function AbcPage({ searchParams }: { searchParams: { de?: string; ate?: string } }) {
  return ComercialPage({ searchParams: { ...searchParams, aba: "abc" } });
}
