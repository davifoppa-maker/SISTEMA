import ComercialPage from "../page";

export const dynamic = "force-dynamic";

// Positivação: mesma página do dashboard, aberta direto nessa visão.
export default function PositivacaoPage({ searchParams }: { searchParams: { de?: string; ate?: string } }) {
  return ComercialPage({ searchParams: { ...searchParams, aba: "positivacao" } });
}
