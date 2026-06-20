"use client";

import { useEffect } from "react";

const INTERVAL_MS = 60_000;

async function runSync() {
  await Promise.allSettled([
    fetch("/api/sync/tiny/recent", { method: "POST" }),
    fetch("/api/sync/tiny/payables", { method: "POST" }),
  ]);
}

export function AutoSync() {
  useEffect(() => {
    // Sync imediato ao abrir a página
    runSync();
    const id = setInterval(runSync, INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  return null;
}
