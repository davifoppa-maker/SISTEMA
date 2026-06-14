import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pós Venda Exx — Logística & Pós-venda",
  description: "Camada de controle logístico e pós-venda da Exx Nutrition sobre o Olist Tiny.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
