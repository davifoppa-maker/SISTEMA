export const dynamic = "force-dynamic";

import { MargemClient } from "./margem-client";
import { getCatalog } from "@/lib/catalog";

export default async function MargemPage() {
  // Só o catálogo padrão (SKUs do código) — sem os auto-cadastrados/divergentes.
  const catalog = await getCatalog(false);
  return <MargemClient catalog={catalog} />;
}
