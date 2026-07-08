export const dynamic = "force-dynamic";

import { MargemClient } from "./margem-client";
import { getCatalog } from "@/lib/catalog";

export default async function MargemPage() {
  const catalog = await getCatalog();
  return <MargemClient catalog={catalog} />;
}
