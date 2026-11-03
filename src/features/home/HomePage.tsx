import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { MatchRecord } from '@/application/ports/records';
import { matchService } from '@/infrastructure/container';

export interface HomePageService {
  listRecoverable(): Promise<readonly MatchRecord[]>;
}

export function HomePage({ service = matchService }: { service?: HomePageService }) {
  const [activeMatches, setActiveMatches] = useState<readonly MatchRecord[]>([]);

  useEffect(() => {
    let active = true;
    service
      .listRecoverable()
      .then((matches) => {
        if (active) setActiveMatches(matches);
      })
      .catch(() => {
        if (active) setActiveMatches([]);
      });
    return () => {
      active = false;
    };
  }, [service]);

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-[2rem] bg-ink px-6 py-7 text-white shadow-card sm:px-8 sm:py-9">
        <div className="relative z-10 max-w-md">
          <p className="mb-3 text-xs font-black tracking-[0.22em] text-lime">LISTO PARA JUGAR</p>
          <h1 className="text-balance text-4xl font-black leading-[0.98] tracking-[-0.04em] sm:text-5xl">
            Tu partido,
            <br /> punto a punto.
          </h1>
          <p className="mt-4 max-w-sm text-sm leading-6 text-white/65">
            Configura las reglas, controla el saque y guarda el partido incluso sin conexión.
          </p>
          <Link
            to="/matches/new"
            className="mt-7 flex min-h-14 w-full items-center justify-between rounded-2xl bg-lime px-5 text-sm font-black text-ink transition hover:brightness-105 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-lime sm:w-64"
          >
            Nuevo partido
            <span aria-hidden="true" className="text-xl">
              →
            </span>
          </Link>
        </div>
      </section>

      {activeMatches.length > 0 && (
        <section aria-labelledby="continue-title">
          <p className="text-xs font-black tracking-[0.2em] text-court">EN CURSO</p>
          <h2 id="continue-title" className="mt-1 text-2xl font-black tracking-tight">
            Continuar partido
          </h2>
          <div className="mt-3 space-y-3">
            {activeMatches.map((match) => (
              <Link
                key={match.id}
                to={`/matches/${match.id}/live`}
                className="flex min-h-20 items-center justify-between rounded-2xl bg-white p-4 shadow-soft"
              >
                <span>
                  <span className="block font-black">
                    {match.teams.A.players.map((player) => player.name).join(' · ')}
                  </span>
                  <span className="mt-1 block text-xs font-semibold text-ink/45">
                    contra {match.teams.B.players.map((player) => player.name).join(' · ')}
                  </span>
                </span>
                <span className="grid size-10 place-items-center rounded-full bg-lime font-black">
                  →
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="summary-title">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <p className="text-xs font-black tracking-[0.2em] text-court">TU ACTIVIDAD</p>
            <h2 id="summary-title" className="mt-1 text-2xl font-black tracking-tight">
              Resumen
            </h2>
          </div>
          <span className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-ink/50 shadow-sm">
            En este dispositivo
          </span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            [String(activeMatches.length), 'En curso'],
            ['0', 'Jugadores'],
            ['—', 'Racha'],
          ].map(([value, label]) => (
            <article
              key={label}
              className="rounded-2xl border border-ink/6 bg-white p-4 shadow-soft"
            >
              <p className="text-3xl font-black tracking-tight">{value}</p>
              <p className="mt-1 text-xs font-bold text-ink/45">{label}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-dashed border-ink/15 bg-white/60 p-6 text-center">
        <p className="text-3xl" aria-hidden="true">
          ◌
        </p>
        <h2 className="mt-3 text-lg font-black">Aún no hay partidos</h2>
        <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-ink/50">
          Tu último resultado y el acceso para continuar un partido aparecerán aquí.
        </p>
      </section>
    </div>
  );
}
