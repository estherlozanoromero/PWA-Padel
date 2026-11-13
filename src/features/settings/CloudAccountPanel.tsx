import { useEffect, useState, type FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { cloudAuthService } from '@/application/cloud/authService';
import { cloudSyncService, type PendingInvitation } from '@/application/cloud/cloudSyncService';
import { userMessage } from '@/shared/errors/userMessage';

export function CloudAccountPanel() {
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [invitations, setInvitations] = useState<readonly PendingInvitation[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function load(nextSession?: Session | null) {
    const activeSession =
      nextSession === undefined ? await cloudAuthService.session() : nextSession;
    setSession(activeSession);
    setLastSyncAt(await cloudSyncService.lastSyncAt());
    setInvitations(activeSession ? await cloudSyncService.pendingInvitations() : []);
  }

  useEffect(() => {
    let active = true;
    cloudAuthService
      .session()
      .then((next) => {
        if (!active) return;
        setSession(next);
        return Promise.all([
          cloudSyncService.lastSyncAt(),
          next ? cloudSyncService.pendingInvitations() : Promise.resolve([]),
        ]);
      })
      .then((result) => {
        if (!active || !result) return;
        setLastSyncAt(result[0]);
        setInvitations(result[1]);
      })
      .catch((cause: unknown) => {
        if (active) setError(userMessage(cause, 'No se ha podido comprobar la cuenta.'));
      });
    const unsubscribe = cloudAuthService.onChange((_event, next) => {
      if (active) void load(next);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  async function sendLink(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await cloudAuthService.sendMagicLink(email, displayName);
      setMessage('Te hemos enviado un enlace seguro. Ábrelo desde este dispositivo para entrar.');
    } catch (cause) {
      setError(userMessage(cause, 'No se ha podido enviar el enlace.'));
    } finally {
      setBusy(false);
    }
  }

  async function sync() {
    setBusy(true);
    setError('');
    try {
      const syncedAt = await cloudSyncService.syncAll();
      setLastSyncAt(syncedAt);
      setInvitations(await cloudSyncService.pendingInvitations());
      setMessage('Datos sincronizados correctamente.');
    } catch (cause) {
      setError(userMessage(cause, 'No se ha podido sincronizar.'));
    } finally {
      setBusy(false);
    }
  }

  async function accept(invitation: PendingInvitation) {
    setBusy(true);
    setError('');
    try {
      await cloudSyncService.acceptInvitation(invitation.id);
      await load();
      setMessage(`Ya formas parte de ${invitation.groupName}.`);
    } catch (cause) {
      setError(userMessage(cause, 'No se ha podido aceptar la invitación.'));
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    try {
      await cloudAuthService.signOut();
      setSession(null);
      setInvitations([]);
      setMessage('Sesión cerrada. Tus datos locales siguen en el dispositivo.');
    } finally {
      setBusy(false);
    }
  }

  if (!cloudAuthService.configured) {
    return (
      <section className="rounded-3xl border border-dashed border-ink/15 bg-white p-5">
        <h2 className="text-lg font-black">Cuenta y sincronización</h2>
        <p className="mt-2 text-sm leading-6 text-ink/55">
          La aplicación está preparada para la nube, pero falta conectar el proyecto seguro de
          Supabase. Mientras tanto seguirá funcionando completamente en local.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-3xl bg-white p-5 shadow-sm">
      <h2 className="text-lg font-black">Cuenta y sincronización</h2>
      {!session ? (
        <form onSubmit={(event) => void sendLink(event)} className="mt-4 space-y-3">
          <p className="text-sm leading-6 text-ink/55">
            Recibe un enlace de acceso por correo. No necesitas crear ni recordar una contraseña.
          </p>
          <label className="block text-sm font-bold">
            Tu nombre
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              required
              maxLength={60}
              className="mt-2 min-h-12 w-full rounded-xl border border-ink/15 px-4"
            />
          </label>
          <label className="block text-sm font-bold">
            Correo electrónico
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              className="mt-2 min-h-12 w-full rounded-xl border border-ink/15 px-4"
            />
          </label>
          <button
            disabled={busy}
            className="min-h-12 w-full rounded-xl bg-court px-4 text-sm font-black text-white disabled:opacity-50"
          >
            Enviar enlace de acceso
          </button>
        </form>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="rounded-2xl bg-mist p-4">
            <p className="text-xs font-black uppercase tracking-wider text-court">Sesión activa</p>
            <p className="mt-1 truncate font-bold">{session.user.email}</p>
            <p className="mt-1 text-xs text-ink/45">
              {lastSyncAt
                ? `Última sincronización: ${new Date(lastSyncAt).toLocaleString('es-ES')}`
                : 'Todavía no se ha sincronizado.'}
            </p>
          </div>
          {invitations.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-black">Invitaciones pendientes</h3>
              {invitations.map((invitation) => (
                <article
                  key={invitation.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-ink/8 p-3"
                >
                  <div>
                    <p className="font-black">{invitation.groupName}</p>
                    <p className="text-xs text-ink/45">Rol: {invitation.role}</p>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void accept(invitation)}
                    className="min-h-11 rounded-xl bg-court px-3 text-xs font-black text-white"
                  >
                    Aceptar
                  </button>
                </article>
              ))}
            </div>
          )}
          <button
            type="button"
            disabled={busy || !navigator.onLine}
            onClick={() => void sync()}
            className="min-h-12 w-full rounded-xl bg-court px-4 text-sm font-black text-white disabled:opacity-50"
          >
            Sincronizar ahora
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void signOut()}
            className="min-h-11 w-full rounded-xl border border-ink/10 text-sm font-bold"
          >
            Cerrar sesión
          </button>
        </div>
      )}
      {message && (
        <p role="status" className="mt-4 rounded-2xl bg-lime/25 p-3 text-sm font-bold text-court">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}
