"use client";

export function ImprimirButton() {
  return (
    <button
      onClick={() => window.print()}
      className="no-print rounded-lg border border-white/20 px-4 py-2 text-sm font-medium text-white hover:bg-white/10"
    >
      🖨️ Imprimir separação
    </button>
  );
}
