import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NYER APP — Logística & Pós-venda",
  description: "Sistema de controle logístico e pós-venda.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
