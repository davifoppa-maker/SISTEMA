"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/** Uma linha de cubagem (valores como texto, para edição). Dimensões em metros. */
export interface CubagemRow {
  altura: string;
  largura: string;
  comprimento: string;
  volumes: string;
}

export const emptyCubagemRow = (volumes = "1"): CubagemRow => ({
  altura: "",
  largura: "",
  comprimento: "",
  volumes,
});

function toNum(s: string): number {
  return Number(String(s).replace(",", ".")) || 0;
}

/** Soma das quantidades de todas as linhas. */
export function totalVolumes(rows: CubagemRow[]): number {
  return rows.reduce((sum, r) => sum + (parseInt(r.volumes, 10) || 0), 0);
}

/** Linhas → cubagem numérica (metros) para enviar à Braspress. Ignora linhas sem medida. */
export function cubagemToPayload(rows: CubagemRow[]) {
  return rows
    .filter((r) => toNum(r.altura) > 0 && toNum(r.largura) > 0 && toNum(r.comprimento) > 0)
    .map((r) => ({
      altura: toNum(r.altura),
      largura: toNum(r.largura),
      comprimento: toNum(r.comprimento),
      volumes: parseInt(r.volumes, 10) || 1,
    }));
}

/** Metros → cm, sem casas inúteis (0.33 → 33; 0.335 → 33.5). */
function mToCm(m: number): number {
  return Math.round(m * 1000) / 10;
}

/** Linhas → texto legível para o pacote de WhatsApp (ex.: "2x 40x30x30cm, 1x 50x40x40cm"). */
export function cubagemToText(rows: CubagemRow[]): string {
  const parts = rows
    .filter((r) => toNum(r.altura) > 0 && toNum(r.largura) > 0 && toNum(r.comprimento) > 0)
    .map(
      (r) =>
        `${parseInt(r.volumes, 10) || 1}x ${mToCm(toNum(r.altura))}x${mToCm(toNum(r.largura))}x${mToCm(toNum(r.comprimento))}cm`,
    );
  return parts.join(", ");
}

/** Editor controlado de volumes/dimensões: N linhas (altura×largura×comprimento + qtd). */
export function CubagemEditor({
  rows,
  onChange,
}: {
  rows: CubagemRow[];
  onChange: (rows: CubagemRow[]) => void;
}) {
  function updateRow(i: number, patch: Partial<CubagemRow>) {
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addRow() {
    onChange([...rows, emptyCubagemRow()]);
  }
  function removeRow(i: number) {
    if (rows.length > 1) onChange(rows.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Cada linha é um conjunto de caixas com a mesma medida (em metros). Use linhas diferentes para dimensões diferentes.
      </p>
      {rows.map((row, i) => (
        <div key={i} className="grid grid-cols-2 items-end gap-2 sm:grid-cols-5">
          <Field label="Altura (m)">
            <Input value={row.altura} onChange={(e) => updateRow(i, { altura: e.target.value })} inputMode="decimal" placeholder="0,40" />
          </Field>
          <Field label="Largura (m)">
            <Input value={row.largura} onChange={(e) => updateRow(i, { largura: e.target.value })} inputMode="decimal" placeholder="0,30" />
          </Field>
          <Field label="Compr. (m)">
            <Input value={row.comprimento} onChange={(e) => updateRow(i, { comprimento: e.target.value })} inputMode="decimal" placeholder="0,50" />
          </Field>
          <Field label="Qtd">
            <Input value={row.volumes} onChange={(e) => updateRow(i, { volumes: e.target.value })} inputMode="numeric" />
          </Field>
          <Button type="button" variant="ghost" size="sm" onClick={() => removeRow(i)} disabled={rows.length === 1}>
            Remover
          </Button>
        </div>
      ))}
      <Button type="button" variant="secondary" size="sm" onClick={addRow}>
        + Adicionar dimensão
      </Button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      {children}
    </label>
  );
}
