import { Sidebar } from "@/components/sidebar";
import { DeliveryNotifications } from "@/components/delivery-notifications";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 overflow-x-hidden">
        <div className="mx-auto max-w-7xl px-6 py-6">{children}</div>
      </main>
      <DeliveryNotifications />
    </div>
  );
}
