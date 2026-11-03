import { useEffect, useState } from 'react';
import type { StatisticsReport } from '@/domain/statistics/statistics';
import { matchService } from '@/infrastructure/container';
const empty = {
  played: 0,
  won: 0,
  lost: 0,
  winRate: null,
  setsFor: 0,
  setsAgainst: 0,
  gamesFor: 0,
  gamesAgainst: 0,
  pointsFor: 0,
  pointsAgainst: 0,
};
export function StatisticsPage() {
  const [report, setReport] = useState<StatisticsReport>({ global: empty, players: [], teams: [] });
  const [view, setView] = useState<'players' | 'teams'>('players');
  useEffect(() => {
    void matchService.statistics().then(setReport);
  }, []);
  const rows = view === 'players' ? report.players : report.teams;
  return (
    <div className="space-y-5">
      <header>
        <p className="text-xs font-black tracking-[0.2em] text-court">RENDIMIENTO</p>
        <h1 className="mt-1 text-3xl font-black">Estadísticas</h1>
      </header>
      <section className="grid grid-cols-3 gap-3">
        <Summary label="Partidos" value={report.global.played} />
        <Summary label="Sets" value={report.global.setsFor} />
        <Summary label="Puntos" value={report.global.pointsFor} />
      </section>
      <div className="grid grid-cols-2 rounded-2xl bg-ink/5 p-1">
        {(['players', 'teams'] as const).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setView(item)}
            className={`min-h-11 rounded-xl text-xs font-black ${view === item ? 'bg-white text-court shadow-sm' : 'text-ink/45'}`}
          >
            {item === 'players' ? 'Jugadores' : 'Parejas'}
          </button>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="rounded-3xl border border-dashed border-ink/15 p-7 text-center text-sm text-ink/50">
          Termina un partido para generar estadísticas.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-3xl bg-white shadow-sm">
          <table className="w-full min-w-[42rem] text-left text-xs">
            <thead className="text-ink/40">
              <tr>
                {['Nombre', 'PJ', 'PG', 'PP', '%', 'Sets +/−', 'Juegos +/−', 'Puntos +/−'].map(
                  (label) => (
                    <th key={label} className="p-3 font-black">
                      {label}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={'playerId' in row ? row.playerId : row.canonicalKey}
                  className="border-t border-ink/6"
                >
                  <td className="p-3 font-black">{row.name}</td>
                  <td className="p-3">{row.played}</td>
                  <td className="p-3">{row.won}</td>
                  <td className="p-3">{row.lost}</td>
                  <td className="p-3">
                    {row.winRate === null ? '—' : `${Math.round(row.winRate)}%`}
                  </td>
                  <td className="p-3">
                    {row.setsFor}/{row.setsAgainst}
                  </td>
                  <td className="p-3">
                    {row.gamesFor}/{row.gamesAgainst}
                  </td>
                  <td className="p-3">
                    {row.pointsFor}/{row.pointsAgainst}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
function Summary({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-white p-4 text-center shadow-sm">
      <p className="text-2xl font-black">{value}</p>
      <p className="text-[0.65rem] font-black text-ink/40">{label.toUpperCase()}</p>
    </div>
  );
}
