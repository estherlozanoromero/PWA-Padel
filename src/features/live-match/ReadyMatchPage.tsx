import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { MatchId } from '@/domain/common/types';
import { currentServer } from '@/domain/matches/service';
import type { RecoveredMatch } from '@/application/ports/repositories';
import { matchService } from '@/infrastructure/container';

export function ReadyMatchPage() {
  const { id } = useParams();
  const [match, setMatch] = useState<RecoveredMatch | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    matchService
      .recover(id as MatchId)
      .then(setMatch)
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : 'No se puede abrir el partido.'),
      );
  }, [id]);

  if (error) return <p role="alert">{error}</p>;
  if (!match) return <p className="py-20 text-center text-sm text-ink/50">Preparando marcador…</p>;

  const serverId = currentServer(match.state);
  const allPlayers = [...match.state.teams.A.players, ...match.state.teams.B.players];
  const server = allPlayers.find((player) => player.id === serverId);

  return (
    <main className="min-h-dvh bg-mist p-5 sm:grid sm:place-items-center">
      <section className="mx-auto max-w-2xl overflow-hidden rounded-[2rem] bg-ink p-7 text-white shadow-card">
        <p className="text-xs font-black tracking-[0.2em] text-lime">PARTIDO CREADO</p>
        <h1 className="mt-3 text-4xl font-black tracking-tight">Partido listo</h1>
        <p className="mt-3 text-sm leading-6 text-white/60">
          Las parejas, las reglas y el orden de saque ya están guardados en el dispositivo.
        </p>
        <div className="mt-7 grid gap-3 sm:grid-cols-2">
          {(['A', 'B'] as const).map((side) => (
            <article key={side} className="rounded-2xl bg-white/8 p-4">
              <p className="text-xs font-black tracking-widest text-lime">PAREJA {side}</p>
              <p className="mt-2 font-black">
                {match.state.teams[side].players.map((player) => player.name).join(' · ')}
              </p>
            </article>
          ))}
        </div>
        <p className="mt-6 rounded-2xl bg-lime px-4 py-3 text-sm font-black text-ink">
          Saca {server?.name ?? 'jugador pendiente'}
        </p>
        <p className="mt-5 text-xs leading-5 text-white/45">
          El marcador interactivo se conectará en la Fase 4. Este partido ya puede recuperarse desde
          IndexedDB.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex min-h-12 items-center rounded-xl border border-white/15 px-5 text-sm font-black"
        >
          Volver al inicio
        </Link>
      </section>
    </main>
  );
}
