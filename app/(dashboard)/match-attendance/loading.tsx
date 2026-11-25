export default function MatchAttendanceLoading() {
  return (
    <section className="mx-auto grid w-full max-w-2xl gap-4" aria-busy="true">
      <h1 className="text-2xl font-semibold">Partidos y asistencias</h1>
      <p className="text-muted-foreground text-sm" role="status">
        Cargando el partido y sus convocados…
      </p>
      <div
        className="bg-muted h-72 rounded-xl motion-safe:animate-pulse"
        aria-hidden="true"
      />
    </section>
  );
}
