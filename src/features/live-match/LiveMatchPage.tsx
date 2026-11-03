import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { MatchId, PlayerId, Side } from '@/domain/common/types';
import { displayPointLabels } from '@/domain/matches/scoring/game';
import { currentServer } from '@/domain/matches/service';
import { currentSet, type MatchState } from '@/domain/matches/types';
import type { MatchCommand } from '@/domain/matches/events';
import type { RecoveredMatch } from '@/application/ports/repositories';
import { matchService } from '@/infrastructure/container';

export interface LiveMatchService {
  recover(matchId: MatchId): Promise<RecoveredMatch>;
  execute(matchId: MatchId, command: MatchCommand): Promise<RecoveredMatch>;
  undo(matchId: MatchId): Promise<RecoveredMatch>;
}

function PlayerName({ name, serving }: { name: string; serving: boolean }) {
  return (
    <span className="flex items-center gap-2">
      {serving && (
        <span
          className="inline-block size-2.5 rounded-full bg-lime shadow-[0_0_0_4px_rgb(199_243_91/0.18)]"
          aria-label="Saca"
        />
      )}
      <span className={serving ? 'font-black' : 'font-semibold text-white/65'}>{name}</span>
    </span>
  );
}

function Modal({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-ink/70 p-3 backdrop-blur-sm sm:place-items-center">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className="w-full max-w-lg rounded-[2rem] bg-white p-6 text-ink shadow-card"
      >
        <h2 id="modal-title" className="text-2xl font-black tracking-tight">
          {title}
        </h2>
        {children}
      </section>
    </div>
  );
}

function scoreLabel(state: MatchState, side: Side): string {
  const set = currentSet(state);
  const index = side === 'A' ? 0 : 1;
  if (set.kind === 'super_tiebreak' || set.tieBreakPoints !== null) {
    return String(set.tieBreakPoints?.[index] ?? 0);
  }
  return displayPointLabels(state.currentPoints)[index];
}

function phaseLabel(state: MatchState): string {
  const set = currentSet(state);
  if (set.kind === 'super_tiebreak') return 'SUPER TIE-BREAK DECISIVO';
  if (set.tieBreakPoints !== null) return 'TIE-BREAK';
  if (state.currentPoints.deuceStage === 'deuce_3_star') return 'STAR POINT';
  if (state.currentPoints.deuceStage.startsWith('advantage_')) return 'VENTAJA';
  return `SET ${set.index + 1} · JUEGO ${set.games[0] + set.games[1] + 1}`;
}

function compactSetScore(state: MatchState, setIndex: number, side: Side): string {
  const set = state.sets[setIndex];
  if (!set) return '0';
  const index = side === 'A' ? 0 : 1;
  if (set.kind === 'super_tiebreak') return String(set.tieBreakPoints?.[index] ?? 0);
  return String(set.games[index]);
}

export function LiveMatchPage({ service = matchService }: { service?: LiveMatchService }) {
  const { id } = useParams();
  const matchId = id as MatchId | undefined;
  const [match, setMatch] = useState<RecoveredMatch | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tapLocked, setTapLocked] = useState(false);
  const [dismissedSideChangeKey, setDismissedSideChangeKey] = useState<string | null>(null);
  const [courtSide, setCourtSide] = useState<'right' | 'left'>('right');
  const [receiverId, setReceiverId] = useState('');
  const [setServerA, setSetServerA] = useState('');
  const [setServerB, setSetServerB] = useState('');
  const lockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!matchId) return;
    let active = true;
    service
      .recover(matchId)
      .then((recovered) => {
        if (active) setMatch(recovered);
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(cause instanceof Error ? cause.message : 'No se puede abrir el partido.');
        }
      });
    return () => {
      active = false;
      if (lockTimer.current) clearTimeout(lockTimer.current);
    };
  }, [matchId, service]);

  const state = match?.state ?? null;
  const serverId = state ? currentServer(state) : null;
  const playersById = useMemo(() => {
    if (!state) return new Map<PlayerId, { name: string }>();
    return new Map(
      [...state.teams.A.players, ...state.teams.B.players].map((player) => [player.id, player]),
    );
  }, [state]);

  const defaultReceiverId = useMemo(() => {
    if (!state || state.status !== 'awaiting_receiver_side' || !state.pendingReceiverChoice) {
      return '';
    }
    const receivers = state.teams[state.pendingReceiverChoice.receivingSide].players;
    const server = serverId
      ? [...state.teams.A.players, ...state.teams.B.players].find(
          (player) => player.id === serverId,
        )
      : undefined;
    return (
      receivers.find((player) => server && player.sportGender === server.sportGender) ??
      receivers[0]
    ).id;
  }, [serverId, state]);

  async function run(command: MatchCommand) {
    if (!matchId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const recovered = await service.execute(matchId, command);
      setMatch(recovered);
      if (command.type === 'CHOOSE_RECEIVER') {
        setReceiverId('');
        setCourtSide('right');
      }
      if (command.type === 'CONFIGURE_SET_SERVICE') {
        setSetServerA('');
        setSetServerB('');
      }
      navigator.vibrate?.(15);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se ha podido guardar la acción.');
    } finally {
      setBusy(false);
    }
  }

  async function awardPoint(winner: Side) {
    if (tapLocked || busy) return;
    setTapLocked(true);
    await run({ type: 'AWARD_POINT', winner });
    lockTimer.current = setTimeout(() => setTapLocked(false), 350);
  }

  async function undo() {
    if (!matchId || busy) return;
    setBusy(true);
    try {
      setMatch(await service.undo(matchId));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No hay ningún punto que deshacer.');
    } finally {
      setBusy(false);
    }
  }

  if (error && !match) {
    return (
      <main className="grid min-h-dvh place-items-center bg-mist p-6">
        <section className="max-w-md rounded-3xl bg-white p-7 text-center shadow-card">
          <h1 className="text-2xl font-black">No se puede abrir el partido</h1>
          <p role="alert" className="mt-3 text-sm text-red-700">
            {error}
          </p>
          <Link to="/" className="mt-6 inline-flex min-h-12 items-center font-black text-court">
            Volver al inicio
          </Link>
        </section>
      </main>
    );
  }
  if (!state || !matchId) {
    return (
      <main className="grid min-h-dvh place-items-center bg-ink text-sm font-bold text-white/60">
        Recuperando partido…
      </main>
    );
  }

  const set = currentSet(state);
  const receiverChoice = state.pendingReceiverChoice;
  const receivingPlayers = receiverChoice
    ? state.teams[receiverChoice.receivingSide].players
    : state.teams.B.players;
  const pointsDisabled = busy || tapLocked || state.status !== 'playing';
  const effectiveReceiverId = receiverId || defaultReceiverId;
  const effectiveSetServerA = setServerA || state.teams.A.players[0].id;
  const effectiveSetServerB = setServerB || state.teams.B.players[0].id;
  const sideChangeKey = `${set.index}:${set.games.join('-')}:${set.tieBreakPoints?.join('-') ?? 'normal'}`;

  return (
    <main className="min-h-dvh bg-ink text-white">
      <div className="mx-auto flex min-h-dvh max-w-3xl flex-col px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))]">
        <header className="flex items-center justify-between gap-3">
          <Link
            to="/"
            aria-label="Volver al inicio"
            className="grid size-12 place-items-center rounded-2xl bg-white/8 font-black"
          >
            ←
          </Link>
          <div className="text-center">
            <p className="text-[0.65rem] font-black tracking-[0.2em] text-lime">EN DIRECTO</p>
            <h1 className="mt-1 text-sm font-black">Marcador en directo</h1>
          </div>
          <button
            type="button"
            onClick={() =>
              void run({ type: state.status === 'paused' ? 'RESUME_MATCH' : 'PAUSE_MATCH' })
            }
            disabled={
              busy || !['playing', 'awaiting_receiver_side', 'paused'].includes(state.status)
            }
            className="min-h-12 rounded-2xl bg-white/8 px-3 text-xs font-black disabled:opacity-30"
          >
            {state.status === 'paused' ? 'Reanudar' : 'Pausar'}
          </button>
        </header>

        {error && (
          <p
            role="alert"
            className="mt-3 rounded-xl bg-red-500/15 px-4 py-3 text-xs font-bold text-red-100"
          >
            {error}
          </p>
        )}

        <section className="mt-5 rounded-3xl bg-white/6 p-4">
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs font-black tracking-[0.16em] text-lime">{phaseLabel(state)}</p>
            <div className="flex gap-2" aria-label="Resultado por sets">
              {state.sets.map((item, index) => (
                <span
                  key={item.index}
                  className="grid grid-cols-2 gap-1 rounded-lg bg-white/8 px-2 py-1 text-xs font-black"
                >
                  <span>{compactSetScore(state, index, 'A')}</span>
                  <span className="text-white/45">{compactSetScore(state, index, 'B')}</span>
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-4 grid flex-1 grid-rows-2 gap-3 sm:grid-cols-2 sm:grid-rows-1">
          {(['A', 'B'] as const).map((side) => {
            const team = state.teams[side];
            const gameIndex = side === 'A' ? 0 : 1;
            const displayedScore = scoreLabel(state, side);
            return (
              <button
                key={side}
                type="button"
                onClick={() => void awardPoint(side)}
                disabled={pointsDisabled}
                aria-label={`Punto para pareja ${side}`}
                className={`group relative min-h-52 overflow-hidden rounded-[2rem] border p-5 text-left transition active:scale-[0.985] disabled:opacity-55 ${
                  side === 'A' ? 'border-lime/25 bg-court' : 'border-white/10 bg-[#102921]'
                }`}
              >
                <div className="flex h-full flex-col">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[0.65rem] font-black tracking-[0.2em] text-white/45">
                        PAREJA {side}
                      </p>
                      <div className="mt-3 space-y-2 text-sm">
                        {team.players.map((player) => (
                          <PlayerName
                            key={player.id}
                            name={player.name}
                            serving={player.id === serverId}
                          />
                        ))}
                      </div>
                    </div>
                    <span className="text-right">
                      <span className="block text-[0.65rem] font-black tracking-widest text-white/40">
                        JUEGOS
                      </span>
                      <span className="text-3xl font-black">{set.games[gameIndex]}</span>
                    </span>
                  </div>
                  <div className="mt-auto flex items-end justify-between pt-6">
                    <span className="text-xs font-black uppercase tracking-widest text-white/45">
                      + Punto
                    </span>
                    <span
                      aria-label={`Puntuación pareja ${side}: ${displayedScore}`}
                      className="text-7xl font-black leading-none tracking-[-0.08em] sm:text-8xl"
                    >
                      {displayedScore}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </section>

        <footer className="mt-4 flex items-center justify-between gap-3">
          <p className="min-w-0 truncate text-xs font-bold text-white/45">
            {serverId ? `Saca ${playersById.get(serverId)?.name ?? ''}` : 'Saque pendiente'}
          </p>
          <button
            type="button"
            onClick={() => void undo()}
            disabled={busy}
            className="min-h-12 rounded-2xl border border-white/10 px-5 text-xs font-black disabled:opacity-40"
          >
            ↶ Deshacer
          </button>
        </footer>
      </div>

      {state.status === 'paused' && (
        <Modal title="Partido pausado">
          <p className="mt-3 text-sm leading-6 text-ink/55">
            El marcador está guardado en este dispositivo.
          </p>
          <button
            type="button"
            onClick={() => void run({ type: 'RESUME_MATCH' })}
            className="mt-6 min-h-14 w-full rounded-2xl bg-court font-black text-white"
          >
            Reanudar partido
          </button>
        </Modal>
      )}

      {state.status === 'awaiting_receiver_side' && receiverChoice && (
        <Modal title={receiverChoice.reason === 'star_point' ? 'Star Point' : 'Punto de oro'}>
          <p className="mt-2 text-sm leading-6 text-ink/55">
            La pareja {receiverChoice.receivingSide} elige lado y receptor antes del punto decisivo.
          </p>
          <fieldset className="mt-5">
            <legend className="text-sm font-black">Lado de recepción</legend>
            <div className="mt-2 grid grid-cols-2 gap-3">
              {(['right', 'left'] as const).map((side) => (
                <label
                  key={side}
                  className={`flex min-h-12 items-center justify-center rounded-xl border font-black ${
                    courtSide === side ? 'border-court bg-court/8 text-court' : 'border-ink/10'
                  }`}
                >
                  <input
                    type="radio"
                    name="court-side"
                    value={side}
                    checked={courtSide === side}
                    onChange={() => setCourtSide(side)}
                    className="sr-only"
                  />
                  {side === 'right' ? 'Derecha' : 'Izquierda'}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="mt-4 block text-sm font-black">
            Receptor
            <select
              value={effectiveReceiverId}
              onChange={(event) => setReceiverId(event.target.value)}
              className="mt-2 min-h-12 w-full rounded-xl border border-ink/15 bg-white px-3"
            >
              {receivingPlayers.map((player) => (
                <option key={player.id} value={player.id}>
                  {player.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() =>
              void run({
                type: 'CHOOSE_RECEIVER',
                courtSide,
                receiverPlayerId: effectiveReceiverId as PlayerId,
              })
            }
            disabled={busy || !effectiveReceiverId}
            className="mt-6 min-h-14 w-full rounded-2xl bg-court font-black text-white disabled:opacity-50"
          >
            Confirmar receptor
          </button>
        </Modal>
      )}

      {state.status === 'awaiting_set_service_order' && (
        <Modal title={`Saque del set ${set.index + 1}`}>
          <p className="mt-2 text-sm leading-6 text-ink/55">
            La pareja {state.service.firstServingSide} debe servir primero. Elige el primer sacador
            de cada pareja.
          </p>
          {(['A', 'B'] as const).map((side) => (
            <label key={side} className="mt-4 block text-sm font-black">
              Primer sacador de pareja {side}
              <select
                value={side === 'A' ? effectiveSetServerA : effectiveSetServerB}
                onChange={(event) =>
                  side === 'A'
                    ? setSetServerA(event.target.value)
                    : setSetServerB(event.target.value)
                }
                className="mt-2 min-h-12 w-full rounded-xl border border-ink/15 bg-white px-3"
              >
                {state.teams[side].players.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.name}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <button
            type="button"
            disabled={busy || !effectiveSetServerA || !effectiveSetServerB}
            onClick={() =>
              void run({
                type: 'CONFIGURE_SET_SERVICE',
                firstServerId: (state.service.firstServingSide === 'A'
                  ? effectiveSetServerA
                  : effectiveSetServerB) as PlayerId,
                otherTeamFirstServerId: (state.service.firstServingSide === 'A'
                  ? effectiveSetServerB
                  : effectiveSetServerA) as PlayerId,
              })
            }
            className="mt-6 min-h-14 w-full rounded-2xl bg-court font-black text-white disabled:opacity-50"
          >
            Empezar siguiente set
          </button>
        </Modal>
      )}

      {state.sideChangeDue &&
        dismissedSideChangeKey !== sideChangeKey &&
        state.status !== 'finished' && (
          <Modal title="Cambio de lado">
            <p className="mt-2 text-sm leading-6 text-ink/55">
              Corresponde cambiar de lado antes de continuar el partido.
            </p>
            <button
              type="button"
              onClick={() => setDismissedSideChangeKey(sideChangeKey)}
              className="mt-6 min-h-14 w-full rounded-2xl bg-ink font-black text-white"
            >
              Cambio realizado
            </button>
          </Modal>
        )}

      {state.status === 'finished' && state.winner && (
        <Modal title={`Victoria de la pareja ${state.winner}`}>
          <p className="mt-2 text-sm leading-6 text-ink/55">
            {state.teams[state.winner].players.map((player) => player.name).join(' y ')} han ganado
            el partido.
          </p>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => void undo()}
              disabled={busy}
              className="min-h-14 rounded-2xl border border-ink/15 font-black"
            >
              Deshacer punto
            </button>
            <Link
              to="/"
              className="flex min-h-14 items-center justify-center rounded-2xl bg-court font-black text-white"
            >
              Ver resumen
            </Link>
          </div>
        </Modal>
      )}
    </main>
  );
}
