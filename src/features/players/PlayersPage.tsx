import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { PlayerId, TeamId } from '@/domain/common/types';
import type { Player, SportGender } from '@/domain/players/types';
import type { Team } from '@/domain/teams/types';
import { playerService, teamService } from '@/infrastructure/container';
import { userMessage } from '@/shared/errors/userMessage';

export interface PlayersPageServices {
  players: {
    create(input: { name: string; sportGender?: SportGender }): Promise<Player>;
    update(id: PlayerId, input: { name: string; sportGender?: SportGender }): Promise<Player>;
    archive(id: PlayerId): Promise<Player>;
    restore(id: PlayerId): Promise<Player>;
    list(includeArchived?: boolean): Promise<readonly Player[]>;
  };
  teams: {
    create(input: {
      playerIds: readonly [PlayerId, PlayerId];
      displayName?: string | null;
    }): Promise<{ team: Team; reused: boolean }>;
    archive(id: TeamId): Promise<Team>;
    list(includeArchived?: boolean): Promise<readonly Team[]>;
  };
}

const defaultServices: PlayersPageServices = {
  players: playerService,
  teams: teamService,
};

function genderLabel(gender: SportGender) {
  if (gender === 'female') return 'Femenino';
  if (gender === 'male') return 'Masculino';
  return 'Sin especificar';
}

export function PlayersPage({ services = defaultServices }: { services?: PlayersPageServices }) {
  const [tab, setTab] = useState<'players' | 'teams'>('players');
  const [players, setPlayers] = useState<readonly Player[]>([]);
  const [teams, setTeams] = useState<readonly Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Player | null>(null);
  const [name, setName] = useState('');
  const [sportGender, setSportGender] = useState<SportGender>('unspecified');
  const [teamPlayers, setTeamPlayers] = useState<[string, string]>(['', '']);
  const [teamName, setTeamName] = useState('');
  const [saving, setSaving] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const [nextPlayers, nextTeams] = await Promise.all([
        services.players.list(true),
        services.teams.list(true),
      ]);
      setPlayers(nextPlayers);
      setTeams(nextTeams);
      setError(null);
    } catch (cause) {
      setError(userMessage(cause, 'No se han podido cargar los datos.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    Promise.all([services.players.list(true), services.teams.list(true)])
      .then(([nextPlayers, nextTeams]) => {
        if (!active) return;
        setPlayers(nextPlayers);
        setTeams(nextTeams);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(userMessage(cause, 'No se han podido cargar los datos.'));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [services]);

  const visiblePlayers = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('es');
    return players.filter(
      (player) =>
        (showArchived || player.archivedAt === null) &&
        player.name.toLocaleLowerCase('es').includes(normalizedQuery),
    );
  }, [players, query, showArchived]);

  const activePlayers = players.filter((player) => player.archivedAt === null);
  const playerNames = new Map(players.map((player) => [player.id, player.name]));

  function resetPlayerForm() {
    setEditing(null);
    setName('');
    setSportGender('unspecified');
  }

  async function savePlayer(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setNotice(null);
    try {
      if (editing) {
        await services.players.update(editing.id, { name, sportGender });
        setNotice('Jugador actualizado.');
      } else {
        await services.players.create({ name, sportGender });
        setNotice('Jugador creado.');
      }
      resetPlayerForm();
      await refresh();
    } catch (cause) {
      setError(userMessage(cause, 'No se ha podido guardar el jugador.'));
    } finally {
      setSaving(false);
    }
  }

  async function archivePlayer(player: Player) {
    setSaving(true);
    try {
      await services.players.archive(player.id);
      setNotice(`${player.name} se ha archivado.`);
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  async function restorePlayer(player: Player) {
    setSaving(true);
    try {
      await services.players.restore(player.id);
      setNotice(`${player.name} vuelve a estar activo.`);
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  async function saveTeam(event: FormEvent) {
    event.preventDefault();
    if (!teamPlayers[0] || !teamPlayers[1]) {
      setError('Selecciona dos jugadores.');
      return;
    }
    setSaving(true);
    try {
      const result = await services.teams.create({
        playerIds: teamPlayers as [PlayerId, PlayerId],
        displayName: teamName || null,
      });
      setNotice(result.reused ? 'La pareja ya existía y se ha reutilizado.' : 'Pareja creada.');
      setTeamPlayers(['', '']);
      setTeamName('');
      await refresh();
    } catch (cause) {
      setError(userMessage(cause, 'No se ha podido crear la pareja.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-black tracking-[0.2em] text-court">PLANTILLA</p>
        <h1 className="mt-1 text-3xl font-black tracking-tight">Jugadores y parejas</h1>
        <p className="mt-2 max-w-lg text-sm leading-6 text-ink/55">
          Crea tu grupo habitual. El historial se conserva aunque archives una ficha.
        </p>
      </header>

      <div className="grid grid-cols-2 rounded-2xl bg-white p-1 shadow-soft" role="tablist">
        {(['players', 'teams'] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={`min-h-12 rounded-xl text-sm font-black transition ${
              tab === value ? 'bg-ink text-white' : 'text-ink/50'
            }`}
          >
            {value === 'players' ? 'Jugadores' : 'Parejas'}
          </button>
        ))}
      </div>

      {notice && (
        <p className="rounded-2xl bg-lime/35 px-4 py-3 text-sm font-bold" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-800" role="alert">
          {error}
        </p>
      )}

      {tab === 'players' ? (
        <>
          <form
            onSubmit={(event) => void savePlayer(event)}
            className="rounded-3xl bg-white p-5 shadow-soft"
          >
            <h2 className="text-lg font-black">{editing ? 'Editar jugador' : 'Nuevo jugador'}</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_12rem]">
              <label className="text-sm font-bold">
                Nombre
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                  maxLength={60}
                  className="mt-2 min-h-12 w-full rounded-xl border border-ink/15 px-4 font-medium outline-none focus:border-court"
                  placeholder="Ej. Ana García"
                />
              </label>
              <label className="text-sm font-bold">
                Sexo deportivo
                <select
                  value={sportGender}
                  onChange={(event) => setSportGender(event.target.value as SportGender)}
                  className="mt-2 min-h-12 w-full rounded-xl border border-ink/15 bg-white px-3 font-medium"
                >
                  <option value="unspecified">Sin especificar</option>
                  <option value="female">Femenino</option>
                  <option value="male">Masculino</option>
                </select>
              </label>
            </div>
            <div className="mt-4 flex gap-3">
              <button
                type="submit"
                disabled={saving}
                className="min-h-12 flex-1 rounded-xl bg-court px-4 text-sm font-black text-white disabled:opacity-50"
              >
                {editing ? 'Guardar cambios' : 'Añadir jugador'}
              </button>
              {editing && (
                <button
                  type="button"
                  onClick={resetPlayerForm}
                  className="min-h-12 rounded-xl border border-ink/15 px-4 text-sm font-bold"
                >
                  Cancelar
                </button>
              )}
            </div>
          </form>

          <section aria-labelledby="players-list-title">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="players-list-title" className="text-xl font-black">
                Tu plantilla
              </h2>
              <label className="flex items-center gap-2 text-xs font-bold text-ink/60">
                <input
                  type="checkbox"
                  checked={showArchived}
                  onChange={(event) => setShowArchived(event.target.checked)}
                />
                Mostrar archivados
              </label>
            </div>
            <label className="mt-3 block text-sm font-bold">
              <span className="sr-only">Buscar jugadores</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar jugadores"
                className="min-h-12 w-full rounded-xl border border-ink/10 bg-white px-4 shadow-sm"
              />
            </label>
            <div className="mt-3 space-y-3">
              {loading ? (
                <p className="py-6 text-center text-sm text-ink/45">Cargando…</p>
              ) : visiblePlayers.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-ink/15 p-6 text-center text-sm text-ink/50">
                  No hay jugadores que mostrar.
                </p>
              ) : (
                visiblePlayers.map((player) => (
                  <article
                    key={player.id}
                    className="flex items-center gap-3 rounded-2xl border border-ink/6 bg-white p-4 shadow-soft"
                  >
                    <span className="grid size-11 shrink-0 place-items-center rounded-full bg-mist font-black text-court">
                      {player.name.slice(0, 1).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-black">{player.name}</h3>
                      <p className="text-xs font-semibold text-ink/45">
                        {genderLabel(player.sportGender)}
                        {player.archivedAt ? ' · Archivado' : ''}
                      </p>
                    </div>
                    {player.archivedAt ? (
                      <button
                        type="button"
                        onClick={() => void restorePlayer(player)}
                        className="min-h-11 rounded-xl border border-court/20 px-3 text-xs font-black text-court"
                      >
                        Restaurar
                      </button>
                    ) : (
                      <div className="flex gap-1">
                        <button
                          type="button"
                          aria-label={`Editar ${player.name}`}
                          onClick={() => {
                            setEditing(player);
                            setName(player.name);
                            setSportGender(player.sportGender);
                          }}
                          className="grid size-11 place-items-center rounded-xl text-sm font-black text-court"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          aria-label={`Archivar ${player.name}`}
                          onClick={() => void archivePlayer(player)}
                          className="grid min-h-11 place-items-center rounded-xl px-2 text-xs font-black text-red-700"
                        >
                          Archivar
                        </button>
                      </div>
                    )}
                  </article>
                ))
              )}
            </div>
          </section>
        </>
      ) : (
        <>
          <form
            onSubmit={(event) => void saveTeam(event)}
            className="rounded-3xl bg-white p-5 shadow-soft"
          >
            <h2 className="text-lg font-black">Nueva pareja</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {([0, 1] as const).map((index) => (
                <label key={index} className="text-sm font-bold">
                  Jugador {index + 1}
                  <select
                    value={teamPlayers[index]}
                    onChange={(event) => {
                      const next = [...teamPlayers] as [string, string];
                      next[index] = event.target.value;
                      setTeamPlayers(next);
                    }}
                    required
                    className="mt-2 min-h-12 w-full rounded-xl border border-ink/15 bg-white px-3"
                  >
                    <option value="">Seleccionar</option>
                    {activePlayers.map((player) => (
                      <option
                        key={player.id}
                        value={player.id}
                        disabled={teamPlayers[1 - index] === player.id}
                      >
                        {player.name}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <label className="mt-4 block text-sm font-bold">
              Nombre opcional
              <input
                value={teamName}
                onChange={(event) => setTeamName(event.target.value)}
                maxLength={60}
                className="mt-2 min-h-12 w-full rounded-xl border border-ink/15 px-4"
                placeholder="Ej. Las Verdes"
              />
            </label>
            <button
              type="submit"
              disabled={saving || activePlayers.length < 2}
              className="mt-4 min-h-12 w-full rounded-xl bg-court px-4 text-sm font-black text-white disabled:opacity-50"
            >
              Crear pareja
            </button>
          </form>

          <section className="space-y-3" aria-labelledby="teams-title">
            <h2 id="teams-title" className="text-xl font-black">
              Parejas guardadas
            </h2>
            {teams.filter((team) => team.archivedAt === null).length === 0 ? (
              <p className="rounded-2xl border border-dashed border-ink/15 p-6 text-center text-sm text-ink/50">
                Todavía no hay parejas guardadas.
              </p>
            ) : (
              teams
                .filter((team) => team.archivedAt === null)
                .map((team) => (
                  <article
                    key={team.id}
                    className="flex items-center justify-between rounded-2xl bg-white p-4 shadow-soft"
                  >
                    <div>
                      <h3 className="font-black">{team.displayName || 'Pareja sin nombre'}</h3>
                      <p className="mt-1 text-xs font-semibold text-ink/50">
                        {playerNames.get(team.playerIds[0])} · {playerNames.get(team.playerIds[1])}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSaving(true);
                        void services.teams
                          .archive(team.id)
                          .then(refresh)
                          .finally(() => setSaving(false));
                      }}
                      className="min-h-11 rounded-xl px-3 text-xs font-black text-red-700"
                    >
                      Archivar
                    </button>
                  </article>
                ))
            )}
          </section>
        </>
      )}
    </div>
  );
}
