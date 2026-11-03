import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { useNavigate } from 'react-router-dom';
import type { MatchId, PlayerId, Side } from '@/domain/common/types';
import type { Player } from '@/domain/players/types';
import type { Team } from '@/domain/teams/types';
import { createRules, RULES_PRESETS, type RulesPresetId } from '@/domain/matches/rules';
import type { TeamSnapshot } from '@/domain/matches/types';
import type { RecoveredMatch } from '@/application/ports/repositories';
import { matchService, playerService, teamService } from '@/infrastructure/container';
import { userMessage } from '@/shared/errors/userMessage';

export interface MatchSetupServices {
  players: {
    list(includeArchived?: boolean): Promise<readonly Player[]>;
  };
  teams: {
    create(input: {
      playerIds: readonly [PlayerId, PlayerId];
      displayName?: string | null;
    }): Promise<{ team: Team; reused: boolean }>;
  };
  matches: {
    create(input: {
      teams: { A: TeamSnapshot; B: TeamSnapshot };
      rules: ReturnType<typeof createRules>;
    }): Promise<RecoveredMatch>;
    execute(
      matchId: MatchId,
      command:
        | { type: 'START_MATCH'; firstServingSide: Side }
        | {
            type: 'CONFIGURE_SET_SERVICE';
            firstServerId: PlayerId;
            otherTeamFirstServerId: PlayerId;
          },
    ): Promise<RecoveredMatch>;
  };
}

const defaultServices: MatchSetupServices = {
  players: playerService,
  teams: teamService,
  matches: matchService,
};

const presetDescriptions: Record<RulesPresetId, { title: string; detail: string }> = {
  classic_best_of_3: { title: 'Clásico', detail: 'Ventaja · Mejor de 3 sets' },
  golden_best_of_3: { title: 'Punto de oro', detail: 'Punto decisivo en 40-40' },
  star_2026_best_of_3: { title: 'Star Point 2026', detail: 'Dos ventajas y punto decisivo' },
  golden_super_tiebreak: { title: 'Oro + super tie-break', detail: 'Tercer set a 10 puntos' },
  star_2026_super_tiebreak: {
    title: 'Star + super tie-break',
    detail: 'Star Point y tercer set a 10',
  },
};

function snapshot(team: Team, players: readonly [Player, Player]): TeamSnapshot {
  return {
    sourceTeamId: team.id,
    displayName: team.displayName,
    players: players.map((player) => ({
      id: player.id,
      name: player.name,
      sportGender: player.sportGender,
    })) as [TeamSnapshot['players'][0], TeamSnapshot['players'][1]],
  };
}

function PlayerSelect({
  label,
  value,
  onChange,
  players,
  excludedIds,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  players: readonly Player[];
  excludedIds: ReadonlySet<string>;
}) {
  return (
    <label className="text-sm font-bold">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required
        className="mt-2 min-h-14 w-full rounded-2xl border border-ink/15 bg-white px-4 text-base font-bold"
      >
        <option value="">Seleccionar jugador</option>
        {players.map((player) => (
          <option key={player.id} value={player.id} disabled={excludedIds.has(player.id)}>
            {player.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function NewMatchPage({ services = defaultServices }: { services?: MatchSetupServices }) {
  const navigate = useNavigate();
  const [players, setPlayers] = useState<readonly Player[]>([]);
  const [step, setStep] = useState(1);
  const [pairA, setPairA] = useState<[string, string]>(['', '']);
  const [pairB, setPairB] = useState<[string, string]>(['', '']);
  const [preset, setPreset] = useState<RulesPresetId>('star_2026_best_of_3');
  const [firstServingSide, setFirstServingSide] = useState<Side>('A');
  const [firstServerA, setFirstServerA] = useState('');
  const [firstServerB, setFirstServerB] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    services.players
      .list(false)
      .then(setPlayers)
      .catch((cause: unknown) => setError(userMessage(cause, 'No se pueden cargar los jugadores.')))
      .finally(() => setLoading(false));
  }, [services]);

  const playerById = useMemo(
    () => new Map(players.map((player) => [player.id, player])),
    [players],
  );
  const selectedA = new Set(pairA.filter(Boolean));
  function updatePair(
    setter: Dispatch<SetStateAction<[string, string]>>,
    current: [string, string],
    index: 0 | 1,
    value: string,
  ) {
    const next = [...current] as [string, string];
    next[index] = value;
    setter(next);
    setError(null);
  }

  function next() {
    if (step === 1 && (!pairA[0] || !pairA[1] || pairA[0] === pairA[1])) {
      setError('Selecciona dos jugadores distintos para la pareja A.');
      return;
    }
    if (
      step === 2 &&
      (!pairB[0] ||
        !pairB[1] ||
        pairB[0] === pairB[1] ||
        selectedA.has(pairB[0]) ||
        selectedA.has(pairB[1]))
    ) {
      setError('La pareja B necesita otros dos jugadores distintos.');
      return;
    }
    if (step === 3) {
      setFirstServerA(pairA[0]);
      setFirstServerB(pairB[0]);
    }
    setError(null);
    setStep((current) => Math.min(current + 1, 4));
  }

  async function createMatch() {
    const playersA = pairA.map((id) => playerById.get(id as PlayerId)) as [
      Player | undefined,
      Player | undefined,
    ];
    const playersB = pairB.map((id) => playerById.get(id as PlayerId)) as [
      Player | undefined,
      Player | undefined,
    ];
    if (!playersA[0] || !playersA[1] || !playersB[0] || !playersB[1]) {
      setError('Falta algún jugador. Vuelve a revisar las parejas.');
      return;
    }
    if (!firstServerA || !firstServerB) {
      setError('Selecciona el primer sacador de cada pareja.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const [teamAResult, teamBResult] = await Promise.all([
        services.teams.create({ playerIds: pairA as [PlayerId, PlayerId] }),
        services.teams.create({ playerIds: pairB as [PlayerId, PlayerId] }),
      ]);
      const created = await services.matches.create({
        teams: {
          A: snapshot(teamAResult.team, playersA as [Player, Player]),
          B: snapshot(teamBResult.team, playersB as [Player, Player]),
        },
        rules: createRules(preset),
      });
      await services.matches.execute(created.record.id, {
        type: 'START_MATCH',
        firstServingSide,
      });
      await services.matches.execute(created.record.id, {
        type: 'CONFIGURE_SET_SERVICE',
        firstServerId: (firstServingSide === 'A' ? firstServerA : firstServerB) as PlayerId,
        otherTeamFirstServerId: (firstServingSide === 'A'
          ? firstServerB
          : firstServerA) as PlayerId,
      });
      void navigate(`/matches/${created.record.id}/live`, { replace: true });
    } catch (cause) {
      setError(userMessage(cause, 'No se ha podido crear el partido.'));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="py-20 text-center text-sm text-ink/50">Cargando jugadores…</p>;

  if (players.length < 4) {
    return (
      <section className="rounded-[2rem] bg-white p-7 text-center shadow-soft">
        <span className="text-4xl" aria-hidden="true">
          ◉
        </span>
        <h1 className="mt-4 text-2xl font-black">Necesitas cuatro jugadores</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-ink/55">
          Añade al menos cuatro personas activas antes de crear un partido de dobles.
        </p>
        <button
          type="button"
          onClick={() => void navigate('/players')}
          className="mt-6 min-h-12 rounded-xl bg-court px-6 text-sm font-black text-white"
        >
          Ir a jugadores
        </button>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-black tracking-[0.2em] text-court">NUEVO PARTIDO</p>
        <div className="mt-2 flex items-end justify-between gap-4">
          <h1 className="text-3xl font-black tracking-tight">
            {['Pareja A', 'Pareja B', 'Reglas', 'Saque'][step - 1]}
          </h1>
          <span className="text-sm font-black text-ink/40">{step} / 4</span>
        </div>
        <div className="mt-4 grid grid-cols-4 gap-2" aria-label={`Paso ${step} de 4`}>
          {[1, 2, 3, 4].map((value) => (
            <span
              key={value}
              className={`h-1.5 rounded-full ${value <= step ? 'bg-court' : 'bg-ink/10'}`}
            />
          ))}
        </div>
      </header>

      {error && (
        <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-800">
          {error}
        </p>
      )}

      <section className="rounded-[2rem] bg-white p-5 shadow-soft sm:p-7">
        {step === 1 && (
          <div className="space-y-4">
            <p className="text-sm leading-6 text-ink/55">Elige los dos integrantes del lado A.</p>
            <PlayerSelect
              label="Jugador 1 de pareja A"
              value={pairA[0]}
              onChange={(value) => updatePair(setPairA, pairA, 0, value)}
              players={players}
              excludedIds={new Set(pairA[1] ? [pairA[1]] : [])}
            />
            <PlayerSelect
              label="Jugador 2 de pareja A"
              value={pairA[1]}
              onChange={(value) => updatePair(setPairA, pairA, 1, value)}
              players={players}
              excludedIds={new Set(pairA[0] ? [pairA[0]] : [])}
            />
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <p className="text-sm leading-6 text-ink/55">
              Elige dos rivales; nadie puede repetirse.
            </p>
            <PlayerSelect
              label="Jugador 1 de pareja B"
              value={pairB[0]}
              onChange={(value) => updatePair(setPairB, pairB, 0, value)}
              players={players}
              excludedIds={new Set([...selectedA, ...(pairB[1] ? [pairB[1]] : [])])}
            />
            <PlayerSelect
              label="Jugador 2 de pareja B"
              value={pairB[1]}
              onChange={(value) => updatePair(setPairB, pairB, 1, value)}
              players={players}
              excludedIds={new Set([...selectedA, ...(pairB[0] ? [pairB[0]] : [])])}
            />
          </div>
        )}

        {step === 3 && (
          <fieldset className="space-y-3">
            <legend className="mb-4 text-sm leading-6 text-ink/55">
              Selecciona un formato válido. Las reglas quedarán guardadas dentro del partido.
            </legend>
            {(Object.keys(RULES_PRESETS) as RulesPresetId[]).map((id) => (
              <label
                key={id}
                className={`flex cursor-pointer items-center gap-4 rounded-2xl border p-4 transition ${
                  preset === id ? 'border-court bg-court/5' : 'border-ink/10'
                }`}
              >
                <input
                  type="radio"
                  name="rules-preset"
                  value={id}
                  checked={preset === id}
                  onChange={() => setPreset(id)}
                />
                <span className="flex-1">
                  <span className="block font-black">{presetDescriptions[id].title}</span>
                  <span className="mt-1 block text-xs font-semibold text-ink/50">
                    {presetDescriptions[id].detail}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
        )}

        {step === 4 && (
          <div className="space-y-6">
            <fieldset>
              <legend className="text-sm font-black">¿Qué pareja sirve primero?</legend>
              <div className="mt-3 grid grid-cols-2 gap-3">
                {(['A', 'B'] as const).map((side) => (
                  <label
                    key={side}
                    className={`flex min-h-14 items-center justify-center gap-2 rounded-2xl border font-black ${
                      firstServingSide === side
                        ? 'border-court bg-court text-white'
                        : 'border-ink/10'
                    }`}
                  >
                    <input
                      type="radio"
                      name="first-side"
                      value={side}
                      checked={firstServingSide === side}
                      onChange={() => setFirstServingSide(side)}
                      className="sr-only"
                    />
                    Pareja {side}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="block text-sm font-bold">
              Primer sacador de pareja A
              <select
                value={firstServerA}
                onChange={(event) => setFirstServerA(event.target.value)}
                className="mt-2 min-h-14 w-full rounded-2xl border border-ink/15 bg-white px-4 font-bold"
              >
                {pairA.map((id) => (
                  <option key={id} value={id}>
                    {playerById.get(id as PlayerId)?.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-bold">
              Primer sacador de pareja B
              <select
                value={firstServerB}
                onChange={(event) => setFirstServerB(event.target.value)}
                className="mt-2 min-h-14 w-full rounded-2xl border border-ink/15 bg-white px-4 font-bold"
              >
                {pairB.map((id) => (
                  <option key={id} value={id}>
                    {playerById.get(id as PlayerId)?.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="rounded-2xl bg-mist p-4 text-sm">
              <p className="font-black">Orden previsto</p>
              <p className="mt-1 leading-6 text-ink/55">
                {
                  playerById.get(
                    (firstServingSide === 'A' ? firstServerA : firstServerB) as PlayerId,
                  )?.name
                }
                {' → '}
                {
                  playerById.get(
                    (firstServingSide === 'A' ? firstServerB : firstServerA) as PlayerId,
                  )?.name
                }
                {' → compañeros alternos'}
              </p>
            </div>
          </div>
        )}
      </section>

      <div className="flex gap-3">
        {step > 1 && (
          <button
            type="button"
            onClick={() => setStep((current) => current - 1)}
            disabled={saving}
            className="min-h-14 rounded-2xl border border-ink/15 bg-white px-5 text-sm font-black"
          >
            Atrás
          </button>
        )}
        {step < 4 ? (
          <button
            type="button"
            onClick={next}
            className="min-h-14 flex-1 rounded-2xl bg-ink px-5 text-sm font-black text-white"
          >
            Continuar
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void createMatch()}
            disabled={saving}
            className="min-h-14 flex-1 rounded-2xl bg-lime px-5 text-sm font-black text-ink disabled:opacity-50"
          >
            {saving ? 'Creando partido…' : 'Iniciar partido'}
          </button>
        )}
      </div>
    </div>
  );
}
