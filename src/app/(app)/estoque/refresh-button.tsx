"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [spinning, setSpinning] = useState(false);

  function refresh() {
    setSpinning(true);
    startTransition(() => {
      router.refresh();
      // pequeno atraso só para o feedback visual do ícone girando
      setTimeout(() => setSpinning(false), 600);
    });
  }

  return (
    <Button variant="secondary" onClick={refresh} disabled={pending}>
      <RefreshCw className={`mr-2 h-4 w-4 ${spinning ? "animate-spin" : ""}`} />
      Atualizar
    </Button>
  );
}
