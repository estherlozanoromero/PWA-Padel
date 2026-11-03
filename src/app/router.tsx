import { createBrowserRouter } from 'react-router-dom';
import { AppShell } from '@/app/shell/AppShell';
import { PlaceholderPage } from '@/shared/components/PlaceholderPage';
import { HomePage } from '@/features/home/HomePage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <HomePage /> },
      {
        path: 'players',
        element: (
          <PlaceholderPage
            eyebrow="Plantilla"
            title="Jugadores y parejas"
            description="Aquí podrás crear jugadores, combinar parejas y conservar su historial."
          />
        ),
      },
      {
        path: 'matches',
        element: (
          <PlaceholderPage
            eyebrow="Competición"
            title="Partidos"
            description="Los partidos activos y finalizados aparecerán en esta sección."
          />
        ),
      },
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
