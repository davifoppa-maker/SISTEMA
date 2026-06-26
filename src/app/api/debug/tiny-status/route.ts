import { ok } from "@/lib/api";
import { isTinyConnected, isTinyConfigured } from "@/lib/services/tiny-api";
import { getStoredTokens } from "@/lib/services/tiny-tokens";

export const dynamic = "force-dynamic";

export async function GET() {
  const companies = ["nyer", "ecopro"];
  const status: Record<string, unknown> = {};
  for (const id of companies) {
    const configured = isTinyConfigured(id);
    const connected = configured ? await isTinyConnected(id).catch((e: Error) => ({ error: e.message })) : false;
    const tokens = configured ? await getStoredTokens(id).catch(() => null) : null;
    status[id] = {
      configured,
      connected,
      has_access_token: Boolean(tokens?.access_token),
      has_refresh_token: Boolean(tokens?.refresh_token),
      expires_at: tokens?.expires_at ?? null,
    };
  }
  return ok(status);
}
