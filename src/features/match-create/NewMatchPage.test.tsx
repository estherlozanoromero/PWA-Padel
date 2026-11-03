import type { ISODateTime, MatchId, PlayerId, TeamId } from '@/domain/common/types';
import type { Player } from '@/domain/players/types';
import type { Team } from '@/domain/teams/types';
import type { RecoveredMatch } from '@/application/ports/repositories';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { NewMatchPage, type MatchSetupServices } from '@/features/match-create/NewMatchPage';

const now = '2026-11-03T12:00:00.000Z' as ISODateTime;
const players: Player[] = ['Ana', 'Marta', 'Bea', 'Clara'].map((name, index) => ({
  id: `player-${index + 1}` as PlayerId,
  name,
  normalizedName: name.toLowerCase(),
  sportGender: 'female',
  createdAt: now,
  updatedAt: now,
  archivedAt: null,
}));

function team(id: string, playerIds: [PlayerId, PlayerId]): Team {
  return {
    id: id as TeamId,
    playerIds,
    canonicalKey: playerIds.join('::'),
    displayName: null,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
  };
}

function services(): MatchSetupServices {
  const createdMatch = {
    record: { id: 'match-ready' as MatchId },
    state: {},
  } as RecoveredMatch;
  let teamNumber = 0;
  return {
    players: { list: vi.fn(async () => players) },
    teams: {
      create: vi.fn(async (input) => {
        teamNumber += 1;
        return {
          team: team(`team-${teamNumber}`, [...input.playerIds] as [PlayerId, PlayerId]),
          reused: false,
        };
      }),
    },
    matches: {
      create: vi.fn(async () => createdMatch),
      execute: vi.fn(async () => createdMatch),
    },
  };
}

describe('NewMatchPage', () => {
  it('crea las parejas, reglas y saque mediante el asistente', async () => {
    const api = services();
    const user = userEvent.setup();
    const router = createMemoryRouter(
      [
        { path: '/matches/new', element: <NewMatchPage services={api} /> },
        { path: '/matches/:id/live', element: <h1>Marcador preparado</h1> },
      ],
      { initialEntries: ['/matches/new'] },
    );
    render(<RouterProvider router={router} />);

    await screen.findByRole('heading', { name: 'Pareja A' });
    await user.selectOptions(screen.getByLabelText('Jugador 1 de pareja A'), players[0]!.id);
    await user.selectOptions(screen.getByLabelText('Jugador 2 de pareja A'), players[1]!.id);
    await user.click(screen.getByRole('button', { name: 'Continuar' }));

    await user.selectOptions(screen.getByLabelText('Jugador 1 de pareja B'), players[2]!.id);
    await user.selectOptions(screen.getByLabelText('Jugador 2 de pareja B'), players[3]!.id);
    await user.click(screen.getByRole('button', { name: 'Continuar' }));

    await user.click(screen.getByLabelText(/Punto de oro/));
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    await user.click(screen.getByRole('button', { name: 'Iniciar partido' }));

    expect(await screen.findByRole('heading', { name: 'Marcador preparado' })).toBeInTheDocument();
    expect(api.teams.create).toHaveBeenCalledTimes(2);
    expect(api.matches.create).toHaveBeenCalledWith(
      expect.objectContaining({ rules: expect.objectContaining({ deuceMode: 'golden_point' }) }),
    );
    await waitFor(() => expect(api.matches.execute).toHaveBeenCalledTimes(2));
    expect(api.matches.execute).toHaveBeenLastCalledWith('match-ready', {
      type: 'CONFIGURE_SET_SERVICE',
      firstServerId: players[0]!.id,
      otherTeamFirstServerId: players[2]!.id,
    });
  });

  it('deriva a jugadores cuando aún no hay cuatro personas activas', async () => {
    const api = services();
    api.players.list = vi.fn(async () => players.slice(0, 3));
    const router = createMemoryRouter(
      [
        { path: '/matches/new', element: <NewMatchPage services={api} /> },
        { path: '/players', element: <h1>Gestión de jugadores</h1> },
      ],
      { initialEntries: ['/matches/new'] },
    );
    const user = userEvent.setup();
    render(<RouterProvider router={router} />);

    expect(await screen.findByText('Necesitas cuatro jugadores')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ir a jugadores' }));
    expect(
      await screen.findByRole('heading', { name: 'Gestión de jugadores' }),
    ).toBeInTheDocument();
  });
});
