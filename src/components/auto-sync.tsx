"use client";

import { useEffect } from "react";

// Sincronização automática LEVE e COMPARTILHADA entre abas.
//
// Histórico: uma versão anterior rodava a cada 30s em TODA aba e chamava
// endpoints pesados — isso estourou a cota do banco e derrubou o site. Esta
// versão é conservadora:
//   • intervalo de 10 min (não 30s);
//   • trava em localStorage → várias abas não sincronizam em paralelo;
//   • só o endpoint LEVE (pedidos recentes), sem remoção/financeiro;
//   • não roda com a aba em segundo plano.
const INTERVALO_MS = 10 * 60 * 1000; // 10 minutos
const CHAVE = "nyer:lastAutoSync";

function podeSincronizar(): boolean {
  try {
    const ultimo = Number(localStorage.getItem(CHAVE) ?? 0);
    return Date.now() - ultimo >= INTERVALO_MS;
  } catch {
    return true; // sem localStorage: segue o intervalo do timer
  }
}

function marcar() {
  try {
    localStorage.setItem(CHAVE, String(Date.now()));
  } catch {
    /* ignora */
  }
}

async function sincronizar() {
  if (typeof document !== "undefined" && document.hidden) return; // aba oculta
  if (!podeSincronizar()) return; // outra aba já sincronizou há pouco
  marcar(); // marca ANTES para não duplicar entre abas
  try {
    await fetch("/api/sync/tiny/recent", { method: "POST" });
  } catch {
    /* silencioso — o cron diário é a rede de segurança */
  }
}

export function AutoSync() {
  useEffect(() => {
    // Primeira execução após 20s (deixa a página carregar sem concorrência).
    const inicial = setTimeout(sincronizar, 20_000);
    const id = setInterval(sincronizar, INTERVALO_MS);
    // Ao voltar para a aba, verifica se está na hora.
    const onVisible = () => { if (!document.hidden) void sincronizar(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(inicial);
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
