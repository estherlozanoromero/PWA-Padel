import { NavLink, Outlet } from 'react-router-dom';

const navigation = [
  { to: '/', label: 'Inicio', icon: '⌂' },
  { to: '/players', label: 'Jugadores', icon: '◉' },
  { to: '/matches', label: 'Partidos', icon: '◇' },
  { to: '/groups', label: 'Grupos', icon: '◎' },
  { to: '/statistics', label: 'Estadísticas', icon: '↗' },
] as const;

export function AppShell() {
  return (
    <div className="min-h-dvh bg-mist text-ink">
      <header className="sticky top-0 z-20 border-b border-ink/8 bg-mist/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-5">
          <NavLink to="/" className="flex items-center gap-3" aria-label="Padel Score, inicio">
            <span className="grid size-9 place-items-center rounded-xl bg-court text-sm font-black text-white shadow-soft">
              P
            </span>
            <span>
              <span className="block text-sm font-black tracking-tight">PADEL SCORE</span>
              <span className="block text-[0.65rem] font-bold tracking-[0.2em] text-ink/45">
                LOCAL · SINCRONIZABLE
              </span>
            </span>
          </NavLink>
          <NavLink
            to="/settings"
            className="grid size-11 place-items-center rounded-full border border-ink/10 bg-white text-lg shadow-sm"
            aria-label="Abrir ajustes"
          >
            ⚙
          </NavLink>
        </div>
      </header>

      <main className="mx-auto min-h-[calc(100dvh-8.5rem)] max-w-3xl px-5 pb-28 pt-7">
        <Outlet />
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-20 border-t border-ink/8 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl"
        aria-label="Navegación principal"
      >
        <div className="mx-auto grid h-20 max-w-3xl grid-cols-5 px-1">
          {navigation.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex min-h-12 flex-col items-center justify-center gap-1 rounded-2xl text-[0.68rem] font-bold transition ${
                  isActive ? 'text-court' : 'text-ink/45 hover:text-ink/70'
                }`
              }
            >
              <span className="text-xl leading-none" aria-hidden="true">
                {item.icon}
              </span>
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
