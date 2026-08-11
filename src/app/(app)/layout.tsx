import { Sidebar } from "@/components/sidebar";
import { DeliveryNotifications } from "@/components/delivery-notifications";
import { AutoSync } from "@/components/auto-sync";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Login de representante removido — só existe o perfil admin.
  return (
    <div className="flex min-h-screen">
      <Sidebar isRep={false} />
      <main className="flex-1 overflow-x-hidden">
        <div className="mx-auto max-w-7xl px-4 pt-16 pb-6 sm:px-6 md:pt-6">{children}</div>
      </main>
      <DeliveryNotifications />
      <AutoSync />
    </div>
  );
}
