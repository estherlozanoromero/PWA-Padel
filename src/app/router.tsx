import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { AppShell } from '@/app/shell/AppShell';
import { PlaceholderPage } from '@/shared/components/PlaceholderPage';

const HomePage = lazy(() =>
  import('@/features/home/HomePage').then((module) => ({ default: module.HomePage })),
);

const PlayersPage = lazy(() =>
  import('@/features/players/PlayersPage').then((module) => ({ default: module.PlayersPage })),
);
const MatchesPage = lazy(() =>
  import('@/features/matches/MatchesPage').then((module) => ({ default: module.MatchesPage })),
);
const NewMatchPage = lazy(() =>
  import('@/features/match-create/NewMatchPage').then((module) => ({
    default: module.NewMatchPage,
  })),
);
const LiveMatchPage = lazy(() =>
  import('@/features/live-match/LiveMatchPage').then((module) => ({
    default: module.LiveMatchPage,
  })),
);

function deferred(element: ReactNode) {
  return (
    <Suspense fallback={<p className="py-20 text-center text-sm text-ink/50">Cargando…</p>}>
      {element}
    </Suspense>
  );
}

export const router = createBrowserRouter([
  { path: '/matches/:id/live', element: deferred(<LiveMatchPage />) },
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: deferred(<HomePage />) },
      {
        path: 'players',
        element: deferred(<PlayersPage />),
      },
      {
        path: 'matches',
        element: deferred(<MatchesPage />),
      },
      { path: 'matches/new', element: deferred(<NewMatchPage />) },
      {
        path: 'statistics',
        element: (
          <PlaceholderPage
            eyebrow="Rendimiento"
            title="Estadísticas"
            description="Victorias, sets, juegos y puntos se calcularán desde el historial real."
          />
        ),
      },
    ],
  },
]);
