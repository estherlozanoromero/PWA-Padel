import { Link } from 'react-router-dom';

export function MatchesPage() {
  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-black tracking-[0.2em] text-court">COMPETICIÓN</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight">Partidos</h1>
        </div>
        <Link
          to="/matches/new"
          className="inline-flex min-h-12 items-center rounded-xl bg-court px-4 text-sm font-black text-white"
        >
          Nuevo
        </Link>
      </header>
      <section className="rounded-3xl border border-dashed border-ink/15 bg-white/60 p-7 text-center">
        <p className="text-3xl" aria-hidden="true">
          ◇
        </p>
        <h2 className="mt-3 text-lg font-black">El historial está preparado</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-ink/50">
          En la siguiente fase esta pantalla mostrará los partidos activos y finalizados.
        </p>
      </section>
    </div>
  );
}
