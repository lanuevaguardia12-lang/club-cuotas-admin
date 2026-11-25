export default function PlayerPaymentLoading() {
  return (
    <main
      className="mx-auto grid w-full max-w-2xl min-w-0 gap-6"
      aria-busy="true"
      aria-label="Cargando cuotas para pagar"
    >
      <p className="text-muted-foreground text-sm" role="status">
        Cargando tus cuotas…
      </p>
      <section className="border-border bg-card grid gap-4 rounded-2xl border p-4 sm:p-6">
        <h1 className="text-2xl font-semibold">Pagar cuotas</h1>
        <div
          className="bg-muted h-20 rounded-xl motion-safe:animate-pulse"
          aria-hidden="true"
        />
        <div
          className="bg-muted h-14 rounded-xl motion-safe:animate-pulse"
          aria-hidden="true"
        />
        <div
          className="bg-muted h-14 rounded-xl motion-safe:animate-pulse"
          aria-hidden="true"
        />
      </section>
    </main>
  );
}
