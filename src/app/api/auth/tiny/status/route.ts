import { ok } from "@/lib/api";
import { getTinyConfig, isTinyConfigured, isTinyConnected } from "@/lib/services/tiny-api";

export const dynamic = "force-dynamic";

export async function GET() {
  const companies = ["nyer", "ecopro"] as const;
  const statuses: Record<string, unknown> = {};

  for (const company of companies) {
    const c = getTinyConfig(company);
    const configured = isTinyConfigured(company);
    const connected = configured ? await isTinyConnected(company).catch(() => false) : false;
    statuses[company] = {
      configured,
      connected,
      redirect_uri: c.redirectUri,
      api_base_url: c.apiBaseUrl,
    };
  }

  return ok(statuses);
}
