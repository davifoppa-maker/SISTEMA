import { getCatalog } from "@/lib/catalog";
import { CatalogoClient } from "./catalogo-client";

export const dynamic = "force-dynamic";

export default async function CatalogoPage() {
  const produtos = await getCatalog();
  return <CatalogoClient produtos={produtos} />;
}
