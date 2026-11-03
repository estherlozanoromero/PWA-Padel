import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { MatchDetails } from '@/application/matches/matchService';
import type { MatchStatus } from '@/domain/matches/types';
import { matchService } from '@/infrastructure/container';

type Tab = 'active' | 'finished' | 'cancelled';
export interface MatchHistoryService {
  list(statuses?: readonly MatchStatus[]): ReturnType<typeof matchService.list>;
  inspect(id: Parameters<typeof matchService.inspect>[0]): Promise<MatchDetails>;
}
const statusTabs: Record<Tab, readonly MatchStatus[]> = {
  active: ['draft', 'awaiting_set_service_order', 'playing', 'awaiting_receiver_side', 'paused'],
  finished: ['finished'],
  cancelled: ['cancelled'],
};
function teamName(details: MatchDetails, side: 'A' | 'B') {
  const team = details.state.teams[side];
  return team.displayName ?? team.players.map((player) => player.name).join(' · ');
}
function compactResult(details: MatchDetails) {
  return (
    details.state.sets.map((set) => `${set.games[0]}–${set.games[1]}`).join('  ') || 'Sin sets'
  );
}

export function MatchesPage({ service = matchService }: { service?: MatchHistoryService }) {
  const [tab, setTab] = useState<Tab>('active');
  const [matches, setMatches] = useState<readonly MatchDetails[]>([]);
  const [query, setQuery] = useState('');
  const [date, setDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let current = true;
    service
      .list(statusTabs[tab])
      .then((records) => Promise.all(records.map((record) => service.inspect(record.id))))
      .then((items) => current && setMatches(items))
      .catch(() => current && setError('No se ha podido cargar el historial.'))
      .finally(() => current && setLoading(false));
    return () => {
      current = false;
    };
  }, [service, tab]);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('es');
    return matches.filter((match) => {
      const names = Object.values(match.state.teams)
        .flatMap((team) => team.players.map((player) => player.name))
        .join(' ')
        .toLocaleLowerCase('es');
      return (
        (!normalized || names.includes(normalized)) &&
        (!date || match.record.createdAt.startsWith(date))
      );
    });
  }, [date, matches, query]);
  return (
    <div className="space-y-5">
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
      <div
        className="grid grid-cols-3 rounded-2xl bg-ink/5 p-1"
        role="tablist"
        aria-label="Estado del partido"
      >
        {(['active', 'finished', 'cancelled'] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => {
              setLoading(true);
              setError('');
              setTab(value);
            }}
            className={`min-h-11 rounded-xl text-xs font-black ${tab === value ? 'bg-white text-court shadow-sm' : 'text-ink/45'}`}
          >
            {value === 'active' ? 'Activos' : value === 'finished' ? 'Finalizados' : 'Cancelados'}
          </button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-bold text-ink/55">
          Jugador
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nombre"
            className="mt-1 min-h-12 w-full rounded-xl border border-ink/10 bg-white px-3 text-sm text-ink"
          />
        </label>
        <label className="text-xs font-bold text-ink/55">
          Fecha
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="mt-1 min-h-12 w-full rounded-xl border border-ink/10 bg-white px-3 text-sm text-ink"
          />
        </label>
      </div>
      {loading ? <p className="py-10 text-center text-sm text-ink/45">Cargando partidos…</p> : null}
      {error ? (
        <p role="alert" className="rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">
          {error}
        </p>
      ) : null}
      {!loading && filtered.length === 0 ? (
        <p className="rounded-3xl border border-dashed border-ink/15 bg-white/60 p-7 text-center text-sm text-ink/50">
          No hay partidos para estos filtros.
        </p>
      ) : null}
      <div className="space-y-3">
        {filtered.map((match) => {
          const active = statusTabs.active.includes(match.state.status);
          return (
            <Link
              key={match.record.id}
              to={active ? `/matches/${match.record.id}/live` : `/matches/${match.record.id}`}
              className="block rounded-3xl bg-white p-5 shadow-sm"
            >
              <div className="flex items-center justify-between gap-3 text-[0.68rem] font-black tracking-wider text-ink/40">
                <span>{new Date(match.record.createdAt).toLocaleDateString('es-ES')}</span>
                <span>{match.record.rules.deuceMode.replace('_', ' ').toUpperCase()}</span>
              </div>
              <div className="mt-3 grid grid-cols-[1fr_auto] gap-3">
                <div className="min-w-0 text-sm font-black">
                  <p className={match.state.winner === 'A' ? 'text-court' : ''}>
                    {teamName(match, 'A')}
                  </p>
                  <p className={`mt-2 ${match.state.winner === 'B' ? 'text-court' : ''}`}>
                    {teamName(match, 'B')}
                  </p>
                </div>
                <p className="self-center whitespace-pre text-lg font-black">
                  {compactResult(match)}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
