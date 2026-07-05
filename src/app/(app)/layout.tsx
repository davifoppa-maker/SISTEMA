import { cookies } from "next/headers";
import { Sidebar } from "@/components/sidebar";
import { DeliveryNotifications } from "@/components/delivery-notifications";
import { AutoSync } from "@/components/auto-sync";
import { AUTH_COOKIE, repCredentials, computeAuthToken } from "@/lib/auth-token";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Detecta o perfil pelo cookie: representante vê só o Gestor de Margem.
  const token = cookies().get(AUTH_COOKIE)?.value;
  const rep = repCredentials();
  const repToken = await computeAuthToken(rep.username, rep.password);
  const isRep = Boolean(token && token === repToken);

  return (
    <div className="flex min-h-screen">
      <Sidebar isRep={isRep} />
      <main className="flex-1 overflow-x-hidden">
        <div className="mx-auto max-w-7xl px-4 pt-16 pb-6 sm:px-6 md:pt-6">{children}</div>
      </main>
      {/* Notificações e auto-sync só para o admin (o representante não tem acesso às APIs). */}
      {!isRep && <DeliveryNotifications />}
      {!isRep && <AutoSync />}
    </div>
  );
}
