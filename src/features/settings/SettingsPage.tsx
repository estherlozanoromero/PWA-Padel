import { useRef, useState } from 'react';
import type { BackupPreview } from '@/application/backup/backupService';
import { DATABASE_VERSION } from '@/infrastructure/database/dexie/database';
import { backupService } from '@/infrastructure/container';
import { userMessage } from '@/shared/errors/userMessage';
import { CloudAccountPanel } from '@/features/settings/CloudAccountPanel';

function downloadBackup(data: unknown, filename: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function SettingsPage() {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<BackupPreview | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function exportData() {
    setBusy(true);
    try {
      const backup = await backupService.export();
      downloadBackup(backup, `padel-score-backup-${backup.exportedAt.slice(0, 10)}.json`);
      setMessage('Backup exportado correctamente.');
    } finally {
      setBusy(false);
    }
  }

  async function selectFile(file: File | undefined) {
    if (!file) return;
    setError('');
    setMessage('');
    try {
      setPreview(await backupService.preview(await file.text()));
    } catch (caught) {
      setPreview(null);
      setError(userMessage(caught, 'No se ha podido validar el backup.'));
    }
  }

  async function importData() {
    if (!preview) return;
    setBusy(true);
    setError('');
    try {
      const safety = await backupService.export();
      downloadBackup(safety, `padel-score-seguridad-${safety.exportedAt.slice(0, 10)}.json`);
      await backupService.replaceAll(preview.envelope);
      setPreview(null);
      setMessage('Datos restaurados. Se ha descargado una copia de seguridad previa.');
    } catch (caught) {
      setError(userMessage(caught, 'No se ha podido restaurar el backup.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <header>
        <p className="text-xs font-black tracking-[0.2em] text-court">APLICACIÓN</p>
        <h1 className="mt-1 text-3xl font-black">Ajustes y datos</h1>
      </header>
      <CloudAccountPanel />
      <section className="rounded-3xl bg-white p-5 shadow-sm">
        <h2 className="text-lg font-black">Copia de seguridad</h2>
        <p className="mt-2 text-sm leading-6 text-ink/55">
          Exporta jugadores, parejas, partidos, eventos y ajustes en un archivo JSON verificable.
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => void exportData()}
          className="mt-4 min-h-12 w-full rounded-xl bg-court px-4 text-sm font-black text-white disabled:opacity-50"
        >
          Exportar backup
        </button>
      </section>
      <section className="rounded-3xl bg-white p-5 shadow-sm">
        <h2 className="text-lg font-black">Restaurar backup</h2>
        <p className="mt-2 text-sm leading-6 text-ink/55">
          El archivo se valida antes de reemplazar los datos. Al confirmar se descarga
          automáticamente una copia del estado actual.
        </p>
        <input
          ref={input}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          onChange={(event) => void selectFile(event.target.files?.[0])}
        />
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="mt-4 min-h-12 w-full rounded-xl border border-ink/10 text-sm font-black"
        >
          Seleccionar archivo
        </button>
        {preview ? (
          <div className="mt-4 rounded-2xl bg-mist p-4 text-sm">
            <p className="font-black">Vista previa válida</p>
            <p className="mt-2 text-ink/60">
              {preview.summary.players} jugadores · {preview.summary.teams} parejas ·{' '}
              {preview.summary.matches} partidos · {preview.summary.events} eventos ·{' '}
              {preview.summary.groups} grupos
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void importData()}
              className="mt-4 min-h-12 w-full rounded-xl bg-red-600 px-4 text-sm font-black text-white disabled:opacity-50"
            >
              Confirmar y reemplazar todos los datos
            </button>
          </div>
        ) : null}
      </section>
      {error ? (
        <p role="alert" className="rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">
          {error}
        </p>
      ) : null}
      {message ? (
        <p role="status" className="rounded-2xl bg-lime/25 p-4 text-sm font-bold text-court">
          {message}
        </p>
      ) : null}
      <section className="rounded-3xl bg-white p-5 text-sm shadow-sm">
        <h2 className="font-black">Información</h2>
        <dl className="mt-3 space-y-2 text-ink/55">
          <div className="flex justify-between">
            <dt>Versión</dt>
            <dd>0.1.0</dd>
          </div>
          <div className="flex justify-between">
            <dt>Base de datos</dt>
            <dd>v{DATABASE_VERSION}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Almacenamiento</dt>
            <dd>Local · IndexedDB</dd>
          </div>
          <div className="flex justify-between">
            <dt>PWA</dt>
            <dd>{'serviceWorker' in navigator ? 'Compatible' : 'No compatible'}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Modo</dt>
            <dd>
              {window.matchMedia('(display-mode: standalone)').matches ? 'Instalada' : 'Navegador'}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
