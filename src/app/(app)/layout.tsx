import { cookies } from "next/headers";
import { Sidebar } from "@/components/sidebar";
import { DeliveryNotifications } from "@/components/delivery-notifications";
import { AutoSync } from "@/components/auto-sync";
import { AUTH_COOKIE, expedCredentials, computeAuthToken } from "@/lib/auth-token";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Perfil Expedição vê só a área de expedição.
  const token = cookies().get(AUTH_COOKIE)?.value;
  const exped = expedCredentials();
  const expedToken = await computeAuthToken(exped.username, exped.password);
  const isExped = Boolean(token && token === expedToken);

  return (
    <div className="flex min-h-screen">
      <Sidebar isExped={isExped} />
      <main className="flex-1 overflow-x-hidden">
        <div className="mx-auto max-w-7xl px-4 pt-16 pb-6 sm:px-6 md:pt-6">{children}</div>
      </main>
      <DeliveryNotifications />
      <AutoSync />
    </div>
  );
}
