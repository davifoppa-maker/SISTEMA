"use client";

export function ImprimirButton() {
  return (
    <button
      onClick={() => window.print()}
      className="no-print h-10 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700"
    >
      🖨️ Imprimir demanda
    </button>
  );
}
