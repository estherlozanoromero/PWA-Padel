import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PwaLifecycle() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({ immediate: false });

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    const onInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('beforeinstallprompt', onInstall);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('beforeinstallprompt', onInstall);
    };
  }, []);

  async function install() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  }

  if (!needRefresh && !offlineReady && online && !installPrompt) return null;
  return (
    <aside
      aria-live="polite"
      className="fixed inset-x-3 bottom-24 z-[70] mx-auto max-w-md rounded-2xl border border-white/10 bg-ink p-4 text-sm text-white shadow-card"
    >
      <p className="font-black">
        {needRefresh
          ? 'Hay una actualización disponible'
          : !online
            ? 'Modo sin conexión'
            : offlineReady
              ? 'Lista para funcionar sin conexión'
              : 'Instala Padel Score'}
      </p>
      <p className="mt-1 text-xs leading-5 text-white/65">
        {needRefresh
          ? 'Se aplicará solo cuando tú lo confirmes.'
          : !online
            ? 'El marcador y tus datos locales siguen disponibles.'
            : offlineReady
              ? 'El contenido esencial se ha guardado en este dispositivo.'
              : 'Añádela a tu pantalla de inicio para abrirla como una app.'}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {needRefresh ? (
          <button
            type="button"
            onClick={() => void updateServiceWorker(true)}
            className="min-h-12 rounded-xl bg-lime px-4 font-black text-ink"
          >
            Actualizar ahora
          </button>
        ) : null}
        {installPrompt && online ? (
          <button
            type="button"
            onClick={() => void install()}
            className="min-h-12 rounded-xl bg-lime px-4 font-black text-ink"
          >
            Instalar
          </button>
        ) : null}
        {offlineReady || needRefresh ? (
          <button
            type="button"
            onClick={() => {
              setOfflineReady(false);
              setNeedRefresh(false);
            }}
            className="min-h-12 rounded-xl border border-white/20 px-4 font-black"
          >
            Ahora no
          </button>
        ) : null}
      </div>
    </aside>
  );
}
