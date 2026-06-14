import { ok } from "@/lib/api";
import { getTinyConfig, isTinyConfigured, isTinyConnected } from "@/lib/services/tiny-api";

export const dynamic = "force-dynamic";

// Status da integração com o Olist Tiny: se as credenciais existem e se já há
// uma conta conectada (tokens persistidos).
export async function GET() {
  const c = getTinyConfig();
  const configured = isTinyConfigured();
  const connected = configured ? await isTinyConnected().catch(() => false) : false;
  return ok({
    configured,
    connected,
    redirect_uri: c.redirectUri,
    api_base_url: c.apiBaseUrl,
  });
}
