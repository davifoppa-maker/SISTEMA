"use client";

import { useEffect } from "react";

const INTERVAL_MS = 120_000; // 2 min (era 30s — aliviado para não sobrecarregar)

async function runSync() {
  // AutoSync é LEVE: só o sync recente de pedidos (sem remover apagados, sem
  // contas a pagar). As partes pesadas ficam no cron diário e nos botões.
  await Promise.allSettled([
    fetch("/api/sync/tiny/recent", { method: "POST" }),
  ]);
}

export function AutoSync() {
  useEffect(() => {
    runSync();
    const id = setInterval(runSync, INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  return null;
}
