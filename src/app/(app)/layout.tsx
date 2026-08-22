import { cookies } from "next/headers";
import { Sidebar } from "@/components/sidebar";
import { DeliveryNotifications } from "@/components/delivery-notifications";
import { AutoSync } from "@/components/auto-sync";
import { AUTH_COOKIE, expedCredentials, comercialCredentials, computeAuthToken } from "@/lib/auth-token";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Perfis restritos veem só a sua área (Expedição / Comercial).
  const token = cookies().get(AUTH_COOKIE)?.value;
  const exped = expedCredentials();
  const expedToken = await computeAuthToken(exped.username, exped.password);
  const isExped = Boolean(token && token === expedToken);
  const comercial = comercialCredentials();
  const comercialToken = await computeAuthToken(comercial.username, comercial.password);
  const isComercial = Boolean(token && token === comercialToken);

  return (
    <div className="flex min-h-screen">
      <Sidebar isExped={isExped} isComercial={isComercial} />
      <main className="flex-1 overflow-x-hidden">
        <div className="mx-auto max-w-7xl px-4 pt-16 pb-6 sm:px-6 md:pt-6">{children}</div>
      </main>
      <DeliveryNotifications />
      <AutoSync />
    </div>
  );
}
