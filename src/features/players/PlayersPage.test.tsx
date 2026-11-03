import type { ISODateTime, PlayerId, TeamId } from '@/domain/common/types';
import type { Player } from '@/domain/players/types';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PlayersPage, type PlayersPageServices } from '@/features/players/PlayersPage';

const now = '2026-11-03T12:00:00.000Z' as ISODateTime;
const ana: Player = {
  id: 'ana' as PlayerId,
  name: 'Ana',
  normalizedName: 'ana',
  sportGender: 'female',
  createdAt: now,
  updatedAt: now,
  archivedAt: null,
};

function services(): PlayersPageServices {
  return {
    players: {
      create: vi.fn(async (input) => ({
        ...ana,
        id: 'new-player' as PlayerId,
        name: input.name,
        sportGender: input.sportGender ?? 'unspecified',
      })),
      update: vi.fn(async () => ana),
      archive: vi.fn(async () => ({ ...ana, archivedAt: now })),
      restore: vi.fn(async () => ana),
      list: vi.fn(async () => [ana]),
    },
    teams: {
      create: vi.fn(async () => ({
        reused: false,
        team: {
          id: 'team' as TeamId,
          playerIds: ['ana', 'other'] as [PlayerId, PlayerId],
          canonicalKey: 'ana::other',
          displayName: null,
          createdAt: now,
          updatedAt: now,
          archivedAt: null,
        },
      })),
      archive: vi.fn(async () => ({
        id: 'team' as TeamId,
        playerIds: ['ana', 'other'] as [PlayerId, PlayerId],
        canonicalKey: 'ana::other',
        displayName: null,
        createdAt: now,
        updatedAt: now,
        archivedAt: now,
      })),
      list: vi.fn(async () => []),
    },
  };
}

describe('PlayersPage', () => {
  it('carga la plantilla y crea un jugador', async () => {
    const api = services();
    const user = userEvent.setup();
    render(<PlayersPage services={api} />);

    expect(await screen.findByText('Ana')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Nombre'), 'Marta');
    await user.selectOptions(screen.getByLabelText('Sexo deportivo'), 'female');
    await user.click(screen.getByRole('button', { name: 'Añadir jugador' }));

    await waitFor(() =>
      expect(api.players.create).toHaveBeenCalledWith({ name: 'Marta', sportGender: 'female' }),
    );
    expect(await screen.findByText('Jugador creado.')).toBeInTheDocument();
  });

  it('permite editar y archivar una ficha existente', async () => {
    const api = services();
    const user = userEvent.setup();
    render(<PlayersPage services={api} />);
    await screen.findByText('Ana');

    await user.click(screen.getByRole('button', { name: 'Editar Ana' }));
    const name = screen.getByLabelText('Nombre');
    await user.clear(name);
    await user.type(name, 'Ana Soler');
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(api.players.update).toHaveBeenCalled());

    await user.click(screen.getByRole('button', { name: 'Archivar Ana' }));
    await waitFor(() => expect(api.players.archive).toHaveBeenCalledWith(ana.id));
  });
});
