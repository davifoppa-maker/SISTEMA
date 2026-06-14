import type { Carrier, CarrierMode, Shipment } from "@/lib/types";

// Adaptador genérico de transportadora. No MVP os modos "manual" e "portal" estão
// implementados; "api", "edi" e "hub" têm a interface preparada para conectores
// futuros (Braspress, Rodonaves, Jadlog, Correios, J&T, hubs como Intelipost etc.).

export interface CarrierAdapter {
  mode: CarrierMode;
  /** Monta a URL de rastreio para o cliente, quando aplicável. */
  buildTrackingUrl(carrier: Carrier, shipment: Shipment): string | null;
  /** Busca eventos de rastreio (somente modo api/hub). */
  fetchTracking?(carrier: Carrier, shipment: Shipment): Promise<unknown>;
}

function buildTrackingUrl(carrier: Carrier, shipment: Shipment): string | null {
  if (!carrier.tracking_url_template) return null;
  return carrier.tracking_url_template.replace(
    "{{tracking_code}}",
    shipment.tracking_code ?? "",
  );
}

const manualAdapter: CarrierAdapter = { mode: "manual", buildTrackingUrl };
const portalAdapter: CarrierAdapter = { mode: "portal", buildTrackingUrl };

// Stubs preparados para implementação futura.
const apiAdapter: CarrierAdapter = {
  mode: "api",
  buildTrackingUrl,
  async fetchTracking() {
    throw new Error("Conector de API da transportadora ainda não implementado.");
  },
};

export function getAdapter(mode: CarrierMode): CarrierAdapter {
  switch (mode) {
    case "portal":
      return portalAdapter;
    case "api":
    case "hub":
      return apiAdapter;
    default:
      return manualAdapter;
  }
}
