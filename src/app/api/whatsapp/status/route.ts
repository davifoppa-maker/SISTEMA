import { ok, fail } from "@/lib/api";

export const dynamic = "force-dynamic";

// Proxy do status do worker do WhatsApp (mantém o token no servidor).
export async function GET() {
  const base = process.env.WHATSAPP_WORKER_URL;
  if (!base) {
    return ok({ configured: false, connected: false, state: "off", qr: null });
  }
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/status`, {
      headers: { "x-worker-token": process.env.WHATSAPP_WORKER_TOKEN ?? "" },
      cache: "no-store",
    });
    const data = await res.json();
    return ok({ configured: true, ...data });
  } catch (err) {
    return fail("Worker do WhatsApp indisponível", 502, err instanceof Error ? err.message : err);
  }
}
