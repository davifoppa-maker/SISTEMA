import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, Thead, Th, Tr, Td } from "@/components/ui/table";
import { readStore } from "@/lib/queries";
import { dataDriver } from "@/lib/db";
import { isTinyConfigured, isTinyConnected } from "@/lib/services/tiny-api";
import { SyncTinyButton } from "./sync-tiny-button";

export const dynamic = "force-dynamic";

const COMPANIES = [
  { id: "nyer", label: "NYER Nutrition", envPrefix: "" },
  { id: "ecopro", label: "Ecopro", envPrefix: "ECOPRO_" },
] as const;

export default async function SettingsPage({
  searchParams,
}: {
  searchParams?: { tiny?: string; detalhe?: string; empresa?: string };
}) {
  const store = await readStore();

  const companyStatuses = await Promise.all(
    COMPANIES.map(async (c) => {
      const configured = isTinyConfigured(c.id);
      const connected = configured ? await isTinyConnected(c.id).catch(() => false) : false;
      return { ...c, configured, connected };
    })
  );

  const integrations = [
    { name: "Meta WhatsApp", env: "META_WHATSAPP_TOKEN", configured: Boolean(process.env.META_WHATSAPP_TOKEN) },
    { name: "Supabase", env: "SUPABASE_SERVICE_ROLE_KEY", configured: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY) },
  ];

  const feedbackEmpresa = searchParams?.empresa ?? "nyer";
  const tinyBanner =
    searchParams?.tiny === "conectado"
      ? { variant: "success" as const, text: `Olist Tiny (${feedbackEmpresa === "ecopro" ? "Ecopro" : "NYER"}) conectado com sucesso.` }
      : searchParams?.tiny === "erro"
        ? { variant: "warning" as const, text: `Falha ao conectar ao Tiny (${feedbackEmpresa}): ${searchParams?.detalhe ?? "erro"}` }
        : null;

  return (
    <>
      <PageHeader title="Configurações" description="Regras de automação, integrações e SLAs." />

      {tinyBanner && (
        <div className="mb-4 rounded-lg border border-slate-200 p-3 text-sm">
          <Badge variant={tinyBanner.variant}>{tinyBanner.text}</Badge>
        </div>
      )}

      {companyStatuses.map((company) => (
        <Card className="mb-4" key={company.id}>
          <CardHeader><CardTitle>Olist Tiny — {company.label}</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-slate-500">Credenciais (OAuth):</span>
                  <Badge variant={company.configured ? "success" : "warning"}>
                    {company.configured ? "configuradas" : "ausentes"}
                  </Badge>
                  <span className="text-slate-500">Conta:</span>
                  <Badge variant={company.connected ? "success" : "muted"}>
                    {company.connected ? "conectada" : "não conectada"}
                  </Badge>
                </div>
                <div className="text-xs text-slate-400">
                  Defina <code>{company.envPrefix}TINY_CLIENT_ID</code> e{" "}
                  <code>{company.envPrefix}TINY_CLIENT_SECRET</code> e clique em conectar para autorizar.
                </div>
              </div>
              {company.configured ? (
                <a
                  href={`/api/auth/tiny/login${company.id === "ecopro" ? "?empresa=ecopro" : ""}`}
                  className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800"
                >
                  {company.connected ? "Reconectar" : `Conectar ao Olist Tiny (${company.label})`}
                </a>
              ) : (
                <span className="text-xs text-slate-400">Configure as credenciais para habilitar a conexão.</span>
              )}
            </div>
            {company.id === "nyer" && company.connected && <SyncTinyButton />}
          </CardContent>
        </Card>
      ))}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Integrações</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="mb-2 text-xs text-slate-500">Driver de dados atual: <Badge variant={dataDriver === "supabase" ? "success" : "muted"}>{dataDriver}</Badge></div>
            {integrations.map((i) => (
              <div key={i.name} className="flex items-center justify-between rounded-lg border border-slate-100 p-2">
                <div>
                  <div className="font-medium">{i.name}</div>
                  <div className="text-xs text-slate-400"><code>{i.env}</code></div>
                </div>
                <Badge variant={i.configured ? "success" : "warning"}>{i.configured ? "configurado" : "modo simulação"}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Regras de automação</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <Thead><tr><Th>Regra</Th><Th>Gatilho</Th><Th>Ação</Th><Th>Status</Th></tr></Thead>
              <tbody>
                {store.automation_rules.map((r) => (
                  <Tr key={r.id}>
                    <Td className="font-medium">{r.name}</Td>
                    <Td className="text-xs text-slate-500">{r.trigger}</Td>
                    <Td className="text-xs text-slate-500">{r.action}</Td>
                    <Td><Badge variant={r.active ? "success" : "muted"}>{r.active ? "ativa" : "inativa"}</Badge></Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader><CardTitle>Ferramentas avançadas</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Link
            href="/carriers"
            className="flex items-center justify-between rounded-lg border border-slate-100 p-2 hover:bg-slate-50"
          >
            <span className="font-medium">Transportadoras</span>
            <span className="text-xs text-slate-400">cadastro e rastreio →</span>
          </Link>
          <Link
            href="/raw-payload"
            className="flex items-center justify-between rounded-lg border border-slate-100 p-2 hover:bg-slate-50"
          >
            <span className="font-medium">Payload bruto &amp; webhooks</span>
            <span className="text-xs text-slate-400">
              histórico de webhooks · {store.channel_detection_rules.length} regra(s) de canal →
            </span>
          </Link>
        </CardContent>
      </Card>
    </>
  );
}
