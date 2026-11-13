import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { GroupId, GroupMemberId, PlayerId } from '@/domain/common/types';
import type { GroupDashboard } from '@/application/groups/groupService';
import type { PlayerGroup } from '@/domain/groups/types';
import type { Player } from '@/domain/players/types';
import { groupService, playerService } from '@/infrastructure/container';
import { userMessage } from '@/shared/errors/userMessage';
import { cloudAuthService } from '@/application/cloud/authService';
import { cloudSyncService } from '@/application/cloud/cloudSyncService';

type Tab = 'ranking' | 'members' | 'settings';

export function GroupsPage() {
  const [groups, setGroups] = useState<readonly PlayerGroup[]>([]);
  const [players, setPlayers] = useState<readonly Player[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [dashboard, setDashboard] = useState<GroupDashboard | null>(null);
  const [tab, setTab] = useState<Tab>('ranking');
  const [groupName, setGroupName] = useState('');
  const [existingPlayerId, setExistingPlayerId] = useState('');
  const [guestName, setGuestName] = useState('');
  const [adjustMemberId, setAdjustMemberId] = useState('');
  const [pointsDelta, setPointsDelta] = useState(0);
  const [eloDelta, setEloDelta] = useState(0);
  const [adjustReason, setAdjustReason] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'member'>('member');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function refresh(preferredId?: string) {
    const [nextGroups, nextPlayers] = await Promise.all([
      groupService.list(),
      playerService.list(false),
    ]);
    setGroups(nextGroups);
    setPlayers(nextPlayers);
    const nextId = preferredId ?? selectedId ?? nextGroups[0]?.id ?? '';
    const validId = nextGroups.some((group) => group.id === nextId)
      ? nextId
      : (nextGroups[0]?.id ?? '');
    setSelectedId(validId);
    setDashboard(validId ? await groupService.dashboard(validId as GroupId) : null);
  }

  useEffect(() => {
    let active = true;
    Promise.all([groupService.list(), playerService.list(false)])
      .then(async ([nextGroups, nextPlayers]) => {
        if (!active) return;
        const firstId = nextGroups[0]?.id ?? '';
        setGroups(nextGroups);
        setPlayers(nextPlayers);
        setSelectedId(firstId);
        setDashboard(firstId ? await groupService.dashboard(firstId) : null);
      })
      .catch((cause: unknown) => {
        if (active) setError(userMessage(cause, 'No se han podido cargar los grupos.'));
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    void groupService
      .dashboard(selectedId as GroupId)
      .then(setDashboard)
      .catch((cause: unknown) => setError(userMessage(cause, 'No se ha podido abrir el grupo.')));
  }, [selectedId]);

  const activeMemberPlayerIds = useMemo(
    () =>
      new Set(
        dashboard?.members
          .filter((member) => member.membership.leftAt === null)
          .map((member) => member.membership.playerId) ?? [],
      ),
    [dashboard],
  );
  const availablePlayers = players.filter((player) => !activeMemberPlayerIds.has(player.id));

  async function run(action: () => Promise<void>, success: string) {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      await refresh(selectedId);
      setNotice(success);
    } catch (cause) {
      setError(userMessage(cause, 'No se ha podido completar la operación.'));
    } finally {
      setSaving(false);
    }
  }

  async function createGroup(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      const group = await groupService.create(groupName);
      setSelectedId(group.id);
      setGroupName('');
    }, 'Grupo creado.');
  }

  async function addExisting(event: FormEvent) {
    event.preventDefault();
    if (!selectedId || !existingPlayerId) return;
    await run(async () => {
      await groupService.addMember(selectedId as GroupId, existingPlayerId as PlayerId);
      setExistingPlayerId('');
    }, 'Miembro añadido al grupo.');
  }

  async function createGuest(event: FormEvent) {
    event.preventDefault();
    if (!selectedId) return;
    await run(async () => {
      await groupService.createGuest(selectedId as GroupId, { name: guestName });
      setGuestName('');
    }, 'Invitado creado y añadido.');
  }

  async function saveScoring(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dashboard) return;
    const data = new FormData(event.currentTarget);
    await run(
      () =>
        groupService
          .updateScoring(dashboard.group.id, {
            winPoints: Number(data.get('winPoints')),
            lossPoints: Number(data.get('lossPoints')),
            initialElo: Number(data.get('initialElo')),
            eloKFactor: Number(data.get('eloKFactor')),
          })
          .then(() => undefined),
      'Sistema de puntuación actualizado.',
    );
  }

  async function addAdjustment(event: FormEvent) {
    event.preventDefault();
    if (!dashboard || !adjustMemberId) return;
    await run(async () => {
      await groupService.addAdjustment(dashboard.group.id, adjustMemberId as GroupMemberId, {
        pointsDelta,
        eloDelta,
        reason: adjustReason,
      });
      setPointsDelta(0);
      setEloDelta(0);
      setAdjustReason('');
    }, 'Ajuste registrado.');
  }

  async function inviteMember(event: FormEvent) {
    event.preventDefault();
    if (!dashboard) return;
    await run(async () => {
      await cloudSyncService.syncAll();
      await cloudSyncService.invite(dashboard.group.id, inviteEmail, inviteRole);
      setInviteEmail('');
    }, 'Invitación creada. La persona la verá al entrar con ese correo.');
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-black tracking-[0.2em] text-court">COMUNIDAD</p>
        <h1 className="mt-1 text-3xl font-black tracking-tight">Grupos y ranking</h1>
        <p className="mt-2 text-sm leading-6 text-ink/55">
          Reúne jugadores con o sin cuenta y calcula puntos, victorias y Elo automáticamente.
        </p>
      </header>

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

      <form
        onSubmit={(event) => void createGroup(event)}
        className="flex gap-2 rounded-3xl bg-white p-4 shadow-soft"
      >
        <label className="min-w-0 flex-1 text-sm font-bold">
          Nuevo grupo
          <input
            value={groupName}
            onChange={(event) => setGroupName(event.target.value)}
            required
            minLength={2}
            maxLength={60}
            placeholder="Ej. Liga de los jueves"
            className="mt-2 min-h-12 w-full rounded-xl border border-ink/15 px-4"
          />
        </label>
        <button
          type="submit"
          disabled={saving}
          className="mt-7 min-h-12 rounded-xl bg-court px-4 text-sm font-black text-white disabled:opacity-50"
        >
          Crear
        </button>
      </form>

      {groups.length > 0 && (
        <label className="block text-sm font-bold">
          Grupo activo
          <select
            value={selectedId}
            onChange={(event) => setSelectedId(event.target.value)}
            className="mt-2 min-h-12 w-full rounded-xl border border-ink/15 bg-white px-4 font-bold"
          >
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {dashboard && (
        <>
          <section className="grid grid-cols-3 gap-3">
            <Summary
              value={dashboard.members.filter((item) => item.membership.leftAt === null).length}
              label="Miembros"
            />
            <Summary value={dashboard.countedMatches} label="Partidos" />
            <Summary value={dashboard.group.scoring.winPoints} label="Pts victoria" />
          </section>

          <div className="grid grid-cols-3 rounded-2xl bg-ink/5 p-1" role="tablist">
            {(['ranking', 'members', 'settings'] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={tab === value}
                onClick={() => setTab(value)}
                className={`min-h-11 rounded-xl text-xs font-black ${tab === value ? 'bg-white text-court shadow-sm' : 'text-ink/45'}`}
              >
                {value === 'ranking'
                  ? 'Clasificación'
                  : value === 'members'
                    ? 'Miembros'
                    : 'Reglas'}
              </button>
            ))}
          </div>

          {tab === 'ranking' && (
            <section className="overflow-hidden rounded-3xl bg-white shadow-soft">
              {dashboard.ranking.length === 0 ? (
                <p className="p-7 text-center text-sm text-ink/50">
                  Añade miembros para crear la clasificación.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[32rem] text-left text-sm">
                    <thead className="bg-ink/[0.03] text-[0.65rem] uppercase tracking-wider text-ink/45">
                      <tr>
                        <th className="p-3">#</th>
                        <th className="p-3">Jugador</th>
                        <th className="p-3">PJ</th>
                        <th className="p-3">PG</th>
                        <th className="p-3">Pts</th>
                        <th className="p-3">Elo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dashboard.ranking.map((row, index) => (
                        <tr key={row.memberId} className="border-t border-ink/6">
                          <td className="p-3 font-black text-court">{index + 1}</td>
                          <td className="p-3 font-black">
                            {row.name}
                            <span className="ml-2 text-[0.6rem] uppercase text-ink/35">
                              {row.kind === 'guest' ? 'Invitado' : 'Cuenta'}
                            </span>
                          </td>
                          <td className="p-3">{row.played}</td>
                          <td className="p-3">{row.won}</td>
                          <td className="p-3 text-base font-black">{row.rankingPoints}</td>
                          <td className="p-3 font-bold">{row.elo}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="border-t border-ink/6 px-4 py-3 text-xs text-ink/45">
                Se cuentan los partidos terminados cuyos cuatro jugadores pertenecen al grupo.
              </p>
            </section>
          )}

          {tab === 'members' && (
            <div className="space-y-4">
              <form
                onSubmit={(event) => void addExisting(event)}
                className="rounded-3xl bg-white p-5 shadow-soft"
              >
                <h2 className="font-black">Añadir jugador existente</h2>
                <div className="mt-3 flex gap-2">
                  <select
                    value={existingPlayerId}
                    onChange={(event) => setExistingPlayerId(event.target.value)}
                    required
                    className="min-h-12 min-w-0 flex-1 rounded-xl border border-ink/15 bg-white px-3"
                  >
                    <option value="">Seleccionar jugador</option>
                    {availablePlayers.map((player) => (
                      <option key={player.id} value={player.id}>
                        {player.name}
                      </option>
                    ))}
                  </select>
                  <button
                    disabled={saving || availablePlayers.length === 0}
                    className="min-h-12 rounded-xl bg-court px-4 text-sm font-black text-white disabled:opacity-50"
                  >
                    Añadir
                  </button>
                </div>
              </form>
              <form
                onSubmit={(event) => void createGuest(event)}
                className="rounded-3xl bg-white p-5 shadow-soft"
              >
                <h2 className="font-black">Crear invitado sin cuenta</h2>
                <div className="mt-3 flex gap-2">
                  <input
                    value={guestName}
                    onChange={(event) => setGuestName(event.target.value)}
                    required
                    maxLength={60}
                    placeholder="Nombre del invitado"
                    className="min-h-12 min-w-0 flex-1 rounded-xl border border-ink/15 px-4"
                  />
                  <button
                    disabled={saving}
                    className="min-h-12 rounded-xl bg-ink px-4 text-sm font-black text-white disabled:opacity-50"
                  >
                    Crear
                  </button>
                </div>
              </form>
              <div className="space-y-2">
                {dashboard.members
                  .filter((item) => item.membership.leftAt === null)
                  .map((member) => (
                    <article
                      key={member.membership.id}
                      className="flex items-center justify-between rounded-2xl bg-white p-4 shadow-sm"
                    >
                      <div>
                        <h3 className="font-black">{member.name}</h3>
                        <p className="text-xs font-semibold text-ink/45">
                          {member.membership.kind === 'guest'
                            ? 'Invitado gestionado'
                            : 'Usuario con cuenta'}{' '}
                          · {member.membership.role}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() =>
                          void run(
                            () => groupService.removeMember(member.membership.id),
                            'Miembro retirado del grupo.',
                          )
                        }
                        className="min-h-11 rounded-xl px-3 text-xs font-black text-red-700"
                      >
                        Retirar
                      </button>
                    </article>
                  ))}
              </div>
            </div>
          )}

          {tab === 'settings' && (
            <div className="space-y-4">
              {cloudAuthService.configured && (
                <form
                  onSubmit={(event) => void inviteMember(event)}
                  className="rounded-3xl bg-white p-5 shadow-soft"
                >
                  <h2 className="font-black">Invitar usuario con cuenta</h2>
                  <p className="mt-2 text-sm leading-6 text-ink/50">
                    La invitación aparecerá cuando esa persona acceda con el mismo correo.
                  </p>
                  <label className="mt-3 block text-sm font-bold">
                    Correo electrónico
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={(event) => setInviteEmail(event.target.value)}
                      required
                      className="mt-2 min-h-12 w-full rounded-xl border border-ink/15 px-3"
                    />
                  </label>
                  <label className="mt-3 block text-sm font-bold">
                    Permisos
                    <select
                      value={inviteRole}
                      onChange={(event) => setInviteRole(event.target.value as 'admin' | 'member')}
                      className="mt-2 min-h-12 w-full rounded-xl border border-ink/15 bg-white px-3"
                    >
                      <option value="member">Miembro</option>
                      <option value="admin">Administrador</option>
                    </select>
                  </label>
                  <button
                    disabled={saving}
                    className="mt-4 min-h-12 w-full rounded-xl bg-court text-sm font-black text-white disabled:opacity-50"
                  >
                    Crear invitación
                  </button>
                </form>
              )}
              <form
                key={dashboard.group.updatedAt}
                onSubmit={(event) => void saveScoring(event)}
                className="rounded-3xl bg-white p-5 shadow-soft"
              >
                <h2 className="font-black">Sistema de puntuación</h2>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <NumberField
                    name="winPoints"
                    label="Puntos victoria"
                    value={dashboard.group.scoring.winPoints}
                  />
                  <NumberField
                    name="lossPoints"
                    label="Puntos derrota"
                    value={dashboard.group.scoring.lossPoints}
                  />
                  <NumberField
                    name="initialElo"
                    label="Elo inicial"
                    value={dashboard.group.scoring.initialElo}
                  />
                  <NumberField
                    name="eloKFactor"
                    label="Factor K"
                    value={dashboard.group.scoring.eloKFactor}
                  />
                </div>
                <button
                  disabled={saving}
                  className="mt-4 min-h-12 w-full rounded-xl bg-court text-sm font-black text-white disabled:opacity-50"
                >
                  Guardar reglas
                </button>
              </form>
              <form
                onSubmit={(event) => void addAdjustment(event)}
                className="rounded-3xl bg-white p-5 shadow-soft"
              >
                <h2 className="font-black">Ajuste manual auditable</h2>
                <select
                  value={adjustMemberId}
                  onChange={(event) => setAdjustMemberId(event.target.value)}
                  required
                  className="mt-3 min-h-12 w-full rounded-xl border border-ink/15 bg-white px-3"
                >
                  <option value="">Seleccionar miembro</option>
                  {dashboard.members.map((member) => (
                    <option key={member.membership.id} value={member.membership.id}>
                      {member.name}
                    </option>
                  ))}
                </select>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <label className="text-sm font-bold">
                    Puntos +/−
                    <input
                      type="number"
                      value={pointsDelta}
                      onChange={(event) => setPointsDelta(Number(event.target.value))}
                      className="mt-2 min-h-12 w-full rounded-xl border border-ink/15 px-3"
                    />
                  </label>
                  <label className="text-sm font-bold">
                    Elo +/−
                    <input
                      type="number"
                      value={eloDelta}
                      onChange={(event) => setEloDelta(Number(event.target.value))}
                      className="mt-2 min-h-12 w-full rounded-xl border border-ink/15 px-3"
                    />
                  </label>
                </div>
                <label className="mt-3 block text-sm font-bold">
                  Motivo
                  <input
                    value={adjustReason}
                    onChange={(event) => setAdjustReason(event.target.value)}
                    required
                    minLength={3}
                    maxLength={160}
                    className="mt-2 min-h-12 w-full rounded-xl border border-ink/15 px-3"
                    placeholder="Ej. Penalización acordada"
                  />
                </label>
                <button
                  disabled={saving}
                  className="mt-4 min-h-12 w-full rounded-xl bg-ink text-sm font-black text-white disabled:opacity-50"
                >
                  Registrar ajuste
                </button>
              </form>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Summary({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-2xl bg-white p-4 text-center shadow-sm">
      <p className="text-2xl font-black">{value}</p>
      <p className="text-[0.6rem] font-black uppercase text-ink/40">{label}</p>
    </div>
  );
}

function NumberField({ name, label, value }: { name: string; label: string; value: number }) {
  return (
    <label className="text-sm font-bold">
      {label}
      <input
        name={name}
        type="number"
        required
        defaultValue={value}
        className="mt-2 min-h-12 w-full rounded-xl border border-ink/15 px-3"
      />
    </label>
  );
}
