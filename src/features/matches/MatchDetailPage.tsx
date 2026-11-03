import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { effectiveEvents } from '@/domain/matches/events';
import type { MatchDetails } from '@/application/matches/matchService';
import type { MatchId } from '@/domain/common/types';
import { matchService } from '@/infrastructure/container';

function duration(details: MatchDetails) {
  if (!details.record.startedAt || !details.record.finishedAt) return '—';
  const minutes = Math.max(
    0,
    Math.round(
      (Date.parse(details.record.finishedAt) - Date.parse(details.record.startedAt)) / 60_000,
    ),
  );
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}
export function MatchDetailPage() {
  const { id } = useParams();
  const [details, setDetails] = useState<MatchDetails | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (id)
      void matchService
        .inspect(id as MatchId)
        .then(setDetails)
        .catch(() => setError('No se ha encontrado el partido.'));
  }, [id]);
  if (error) return <p role="alert">{error}</p>;
  if (!details) return <p className="py-20 text-center text-sm text-ink/45">Cargando resumen…</p>;
  const points = effectiveEvents(details.events).filter(
    (item) => item.event.type === 'POINT_AWARDED',
  );
  const winner = details.state.winner ? details.state.teams[details.state.winner] : null;
  return (
    <div className="space-y-5">
      <header>
        <Link to="/matches" className="text-sm font-black text-court">
          ← Historial
        </Link>
        <p className="mt-5 text-xs font-black tracking-[0.2em] text-court">RESUMEN</p>
        <h1 className="text-3xl font-black">Detalle del partido</h1>
      </header>
      {winner ? (
        <section className="rounded-3xl bg-court p-6 text-white">
          <p className="text-xs font-black tracking-widest text-white/65">GANADORES</p>
          <p className="mt-2 text-xl font-black">
            {winner.players.map((player) => player.name).join(' · ')}
          </p>
        </section>
      ) : null}
      <section className="rounded-3xl bg-white p-5 shadow-sm">
        <h2 className="font-black">Resultado por sets</h2>
        <div className="mt-4 space-y-2">
          {details.state.sets.map((set) => (
            <div
              key={set.index}
              className="flex justify-between rounded-xl bg-mist px-4 py-3 text-sm font-black"
            >
              <span>
                Set {set.index + 1}
                {set.kind === 'super_tiebreak' ? ' · Super tie-break' : ''}
              </span>
              <span>
                {set.games[0]}–{set.games[1]}
                {set.tieBreakPoints ? ` (${set.tieBreakPoints[0]}–${set.tieBreakPoints[1]})` : ''}
              </span>
            </div>
          ))}
        </div>
      </section>
      <section className="grid grid-cols-2 gap-3">
        <Metric label="Duración" value={duration(details)} />
        <Metric label="Puntos jugados" value={String(points.length)} />
        <Metric label="Modalidad" value={details.record.rules.deuceMode.replace('_', ' ')} />
        <Metric label="Sets" value={`${details.state.setsWon[0]}–${details.state.setsWon[1]}`} />
      </section>
      <section className="rounded-3xl bg-white p-5 shadow-sm">
        <h2 className="font-black">Reglas utilizadas</h2>
        <dl className="mt-3 space-y-2 text-sm text-ink/60">
          <div className="flex justify-between gap-3">
            <dt>Formato</dt>
            <dd className="font-bold text-ink">
              Al mejor de {details.record.rules.bestOfSets} sets
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt>Desempate</dt>
            <dd className="font-bold capitalize text-ink">
              {details.record.rules.deuceMode.replace('_', ' ')}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt>Set decisivo</dt>
            <dd className="font-bold capitalize text-ink">
              {details.record.rules.decidingSetMode.replace('_', ' ')}
            </dd>
          </div>
        </dl>
      </section>
      <section className="rounded-3xl bg-white p-5 shadow-sm">
        <h2 className="font-black">Participantes</h2>
        {(['A', 'B'] as const).map((side) => (
          <p key={side} className="mt-3 text-sm">
            <strong>Pareja {side}:</strong>{' '}
            {details.state.teams[side].players.map((player) => player.name).join(' · ')}
          </p>
        ))}
      </section>
      <section className="rounded-3xl bg-white p-5 shadow-sm">
        <h2 className="font-black">Cronología</h2>
        <p className="mt-2 text-sm text-ink/55">
          {details.events.length} eventos registrados · inicio{' '}
          {details.record.startedAt
            ? new Date(details.record.startedAt).toLocaleString('es-ES')
            : 'pendiente'}{' '}
          · final{' '}
          {details.record.finishedAt
            ? new Date(details.record.finishedAt).toLocaleString('es-ES')
            : 'pendiente'}
        </p>
      </section>
    </div>
  );
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <p className="text-[0.65rem] font-black tracking-widest text-ink/40">{label.toUpperCase()}</p>
      <p className="mt-1 text-lg font-black capitalize">{value}</p>
    </div>
  );
}
