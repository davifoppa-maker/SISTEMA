// Loading global de TODAS as páginas do app. Sem isso, o clique num link ficava
// "travado" — o navegador esperava a página inteira (dados incluídos) renderizar
// antes de mostrar qualquer coisa. Com este arquivo, o Next.js mostra este
// esqueleto NA HORA do clique, enquanto os dados carregam por trás (streaming).
export default function Loading() {
  return (
    <div className="animate-pulse space-y-4 p-1">
      <div className="h-7 w-56 rounded-lg bg-white/10" />
      <div className="h-4 w-80 rounded bg-white/5" />
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl border border-white/10 bg-white/5" />
        ))}
      </div>
      <div className="mt-6 space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-10 rounded-lg bg-white/5" />
        ))}
      </div>
    </div>
  );
}
