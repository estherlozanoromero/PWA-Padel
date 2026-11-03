import type { MatchId } from '@/domain/common/types';
import { applyPoint, pauseMatch, resumeMatch } from '@/domain/matches/engine';
import type { MatchCommand } from '@/domain/matches/events';
import type { MatchState } from '@/domain/matches/types';
import type { RecoveredMatch } from '@/application/ports/repositories';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { LiveMatchPage, type LiveMatchService } from '@/features/live-match/LiveMatchPage';
import { createPlayingMatch, ids } from '@/domain/matches/test/fixtures';

function recovered(state: MatchState): RecoveredMatch {
  return { record: { id: state.matchId } as RecoveredMatch['record'], state };
}

function renderLive(service: LiveMatchService) {
  const router = createMemoryRouter(
    [{ path: '/matches/:id/live', element: <LiveMatchPage service={service} /> }],
    { initialEntries: ['/matches/match-1/live'] },
  );
  render(<RouterProvider router={router} />);
}

describe('LiveMatchPage', () => {
  it('anota puntos, pausa, reanuda y deshace', async () => {
    const initial = createPlayingMatch();
    let state = initial;
    const execute = vi.fn(async (_matchId: MatchId, command: MatchCommand) => {
      if (command.type === 'AWARD_POINT') state = applyPoint(state, command.winner);
      if (command.type === 'PAUSE_MATCH') state = pauseMatch(state);
      if (command.type === 'RESUME_MATCH') state = resumeMatch(state);
      return recovered(state);
    });
    const service: LiveMatchService = {
      recover: vi.fn(async () => recovered(state)),
      execute,
      undo: vi.fn(async () => {
        state = initial;
        return recovered(state);
      }),
    };
    const user = userEvent.setup();
    renderLive(service);

    expect(await screen.findByRole('heading', { name: 'Marcador en directo' })).toBeInTheDocument();
    const pointA = screen.getByRole('button', { name: 'Punto para pareja A' });
    await user.click(pointA);
    await waitFor(() =>
      expect(within(pointA).getByLabelText('Puntuación pareja A: 15')).toBeInTheDocument(),
    );
    expect(screen.getByText('Saca Ana')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Pausar' }));
    expect(await screen.findByRole('dialog', { name: 'Partido pausado' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reanudar partido' }));
    await waitFor(() => expect(screen.queryByText('Partido pausado')).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /Deshacer/ }));
    await waitFor(() =>
      expect(within(pointA).getByLabelText('Puntuación pareja A: 0')).toBeInTheDocument(),
    );
  });

  it('solicita lado y receptor antes de un Star Point', async () => {
    let state = createPlayingMatch('star_point');
    for (const winner of ['A', 'A', 'A', 'B', 'B', 'B', 'A', 'B', 'B', 'A'] as const) {
      state = applyPoint(state, winner);
    }
    const execute = vi.fn(async () => recovered(state));
    const service: LiveMatchService = {
      recover: vi.fn(async () => recovered(state)),
      execute,
      undo: vi.fn(async () => recovered(state)),
    };
    const user = userEvent.setup();
    renderLive(service);

    expect(await screen.findByRole('dialog', { name: 'Star Point' })).toBeInTheDocument();
    expect(screen.getByLabelText('Receptor')).toHaveValue(ids.b1);
    await user.click(screen.getByText('Izquierda'));
    await user.click(screen.getByRole('button', { name: 'Confirmar receptor' }));

    await waitFor(() =>
      expect(execute).toHaveBeenCalledWith('match-1', {
        type: 'CHOOSE_RECEIVER',
        courtSide: 'left',
        receiverPlayerId: ids.b1,
      }),
    );
  });
});
