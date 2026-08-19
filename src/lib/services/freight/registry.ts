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
import { isMultitransConfigured, quoteMultitrans, trackMultitrans } from "@/lib/services/freight/multitrans";
import { isBrudamConfigured, quoteBrudam, trackBrudam } from "@/lib/services/freight/brudam";
import { isBbmConfigured, quoteBbm, trackBbm } from "@/lib/services/freight/bbm";
import { isTranslovatoConfigured, quoteTranslovato, trackTranslovato } from "@/lib/services/freight/translovato";
import { isCorreiosConfigured, quoteCorreios, trackCorreios } from "@/lib/services/freight/correios";
import { isRodonavesConfigured, quoteRodonaves, trackRodonaves } from "@/lib/services/freight/rodonaves";
import { isEsmConfigured, quoteEsm, trackEsm } from "@/lib/services/freight/esm";
import { isFmConfigured, quoteFm, trackFm } from "@/lib/services/freight/fm";

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

const multitrans: FreightProvider = {
  id: "multitrans",
  label: "Multitrans (legado)",
  isConfigured: isMultitransConfigured,
  // Integração antiga por api.multitrans.com.br (nunca respondeu — 'fetch failed').
  // A Multitrans real usa a plataforma Brudam (provider 'brudam' abaixo). Fica
  // fora da cotacao automatica para nao duplicar/poluir a tela.
  quotable: false,
  quote: quoteMultitrans,
  track: (nf) => trackMultitrans(nf),
};

const brudam: FreightProvider = {
  id: "brudam",
  label: "Multitrans",
  isConfigured: isBrudamConfigured,
  quote: quoteBrudam,
  track: (nf) => trackBrudam(nf),
};

const bbm: FreightProvider = {
  id: "bbm",
  label: "BBM / Translovato",
  isConfigured: isBbmConfigured,
  // A API da BBM (app.bbmlogistica.com.br/api) NÃO tem endpoint de cotação —
  // só ocorrências, comprovantes, notfis e webhooks. Fica fora da cotação
  // automática; permanece registrada para rastreio/ocorrências.
  quotable: false,
  quote: quoteBbm,
  track: (nf) => trackBbm(nf),
};

const translovato: FreightProvider = {
  id: "translovato",
  label: "Translovato",
  isConfigured: isTranslovatoConfigured,
  // Web Service SOAP de cotação (separado da API REST da BBM, que só rastreia).
  quote: quoteTranslovato,
  track: (nf) => trackTranslovato(nf),
};

const correios: FreightProvider = {
  id: "correios",
  label: "Correios",
  isConfigured: isCorreiosConfigured,
  quote: quoteCorreios,
  track: (id) => trackCorreios(id),
};

const rodonaves: FreightProvider = {
  id: "rodonaves",
  label: "Rodonaves",
  isConfigured: isRodonavesConfigured,
  quote: quoteRodonaves,
  track: (nf) => trackRodonaves(nf),
};

const esm: FreightProvider = {
  id: "esm",
  label: "Expresso São Miguel",
  isConfigured: isEsmConfigured,
  quote: quoteEsm,
  track: (nf, cnpj) => trackEsm(nf, cnpj),
};

const fm: FreightProvider = {
  id: "fm",
  label: "FM Transportes",
  isConfigured: isFmConfigured,
  quote: quoteFm,
  track: (id) => trackFm(id),
};

const PROVIDERS: Record<string, FreightProvider> = {
  [braspress.id]: braspress,
  [arlete.id]: arlete,
  [jadlog.id]: jadlog,
  [lenoir.id]: lenoir,
  [multitrans.id]: multitrans,
  [brudam.id]: brudam,
  [bbm.id]: bbm,
  [translovato.id]: translovato,
  [correios.id]: correios,
  [rodonaves.id]: rodonaves,
  [esm.id]: esm,
  [fm.id]: fm,
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
  if (n.includes("multitrans")) return "multitrans";
  if (n.includes("brudam") || n.includes("multi ")) return "brudam";
  if (n.includes("translovato") || n.includes("bbm")) return "bbm";
  if (n.includes("correio")) return "correios";
  if (n.includes("rodonaves") || n.includes("rte")) return "rodonaves";
  if (n.includes("são miguel") || n.includes("sao miguel") || n.includes("expresso s")) return "esm";
  if (n.includes("fm transporte") || n.includes("fmtransporte")) return "fm";
  return null;
}

/** Opções leves (id/label/configurada) para popular seletores na UI. */
export function providerOptions(): { id: string; label: string; configured: boolean }[] {
  return listProviders()
    .filter((p) => p.quotable !== false) // esconde quem não cota (ex.: BBM/Translovato)
    .map((p) => ({ id: p.id, label: p.label, configured: p.isConfigured() }));
}
