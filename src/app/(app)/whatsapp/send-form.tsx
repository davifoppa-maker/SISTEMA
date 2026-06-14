"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";

export function SendForm() {
  const [phone, setPhone] = useState("");
  const [content, setContent] = useState("");
  const [result, setResult] = useState<string | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/messages/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, content }),
    });
    const json = await res.json();
    setResult(json.ok ? `Enviado (status ${json.data.status}).` : json.error);
    if (json.ok) {
      setContent("");
      setTimeout(() => window.location.reload(), 600);
    }
  }

  return (
    <form onSubmit={send} className="space-y-3">
      <div>
        <Label>Telefone (WhatsApp)</Label>
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="5547999990000" required />
      </div>
      <div>
        <Label>Mensagem</Label>
        <Textarea rows={3} value={content} onChange={(e) => setContent(e.target.value)} required />
      </div>
      <Button type="submit">Enviar (modo mock)</Button>
      {result ? <p className="text-xs text-slate-500">{result}</p> : null}
    </form>
  );
}
