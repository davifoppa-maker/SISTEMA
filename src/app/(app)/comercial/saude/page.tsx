import ComercialPage from "../page";

export const dynamic = "force-dynamic";

// Saúde do Comercial: mesma página do dashboard, aberta direto nessa visão.
export default function SaudePage({ searchParams }: { searchParams: { de?: string; ate?: string } }) {
  return ComercialPage({ searchParams: { ...searchParams, aba: "saude" } });
}
