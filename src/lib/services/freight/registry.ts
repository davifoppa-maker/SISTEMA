/**
 * Registro de transportadoras (freight providers).
 *
 * Para adicionar uma transportadora nova:
 *   1. Implemente um objeto `FreightProvider` (ex.: em `freight/jadlog.ts`).
 *   2. Importe-o aqui e adicione em `PROVIDERS`.
 * As rotas (`/api/cotacao/[provider]`, `/api/tracking/[provider]`) e a UI passam a
 * reconhecê-lo automaticamente — nada mais precisa mudar.
 */

import type { FreightProvider } from "./types";
import { isBraspressConfigured, quoteFreight, trackByNf } from "@/lib/services/braspress";
import { isArleteConfigured, quoteArlete, trackArlete } from "@/lib/services/freight/arlete";
import { isJadlogConfigured, quoteJadlog, trackJadlog } from "@/lib/services/freight/jadlog";
import { isLenoirConfigured, quoteLenoir, trackLenoir } from "@/lib/services/freight/lenoir";

const braspress: FreightProvider = {
  id: "braspress",
  label: "Braspress",
  isConfigured: isBraspressConfigured,
  quote: quoteFreight,
  track: trackByNf,
};

const arlete: FreightProvider = {
  id: "arlete",
  label: "Arlete (SSW)",
  isConfigured: isArleteConfigured,
  quote: quoteArlete,
  track: (nf) => trackArlete(nf),
};

const jadlog: FreightProvider = {
  id: "jadlog",
  label: "JadLog",
  isConfigured: isJadlogConfigured,
  quote: quoteJadlog,
  track: (nf) => trackJadlog(nf),
};

const lenoir: FreightProvider = {
  id: "lenoir",
  label: "Lenoir",
  isConfigured: isLenoirConfigured,
  quote: quoteLenoir,
  track: trackLenoir,
};

const PROVIDERS: Record<string, FreightProvider> = {
  [braspress.id]: braspress,
  [arlete.id]: arlete,
  [jadlog.id]: jadlog,
  [lenoir.id]: lenoir,
};

/** Transportadora padrão quando nenhuma é especificada. */
export const DEFAULT_PROVIDER = "braspress";

/** Resolve um provider pelo id (case-insensitive). Retorna null se não existir. */
export function getProvider(id?: string | null): FreightProvider | null {
  return PROVIDERS[(id || DEFAULT_PROVIDER).toLowerCase()] ?? null;
}

/** Lista todas as transportadoras registradas. */
export function listProviders(): FreightProvider[] {
  return Object.values(PROVIDERS);
}

/**
 * Mapeia o NOME da transportadora (como vem do Tiny, ex.: "Arlete Transportes
 * Tubarão", "JadLog") para o id do provider de rastreio. Retorna null se não
 * houver provider correspondente.
 */
export function providerIdForCarrierName(name?: string | null): string | null {
  const n = (name ?? "").toLowerCase();
  if (!n) return null;
  if (n.includes("braspress") || n.includes("brasspress")) return "braspress";
  if (n.includes("jadlog") || n.includes("jadelog")) return "jadlog";
  if (n.includes("arlete")) return "arlete";
  if (n.includes("lenoir")) return "lenoir";
  return null;
}

/** Opções leves (id/label/configurada) para popular seletores na UI. */
export function providerOptions(): { id: string; label: string; configured: boolean }[] {
  return listProviders().map((p) => ({ id: p.id, label: p.label, configured: p.isConfigured() }));
}
