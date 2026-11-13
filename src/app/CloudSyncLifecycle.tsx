import { useEffect } from 'react';
import { cloudAuthService } from '@/application/cloud/authService';
import { cloudSyncService } from '@/application/cloud/cloudSyncService';

export function CloudSyncLifecycle() {
  useEffect(() => {
    if (!cloudAuthService.configured) return;
    let syncing = false;
    async function syncWhenPossible() {
      if (syncing || !navigator.onLine || !(await cloudAuthService.session())) return;
      syncing = true;
      try {
        await cloudSyncService.syncAll();
      } catch {
        // La sincronización manual mostrará el detalle; el ciclo automático no interrumpe la app.
      } finally {
        syncing = false;
      }
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') void syncWhenPossible();
    };
    const onOnline = () => {
      void syncWhenPossible();
    };
    const unsubscribe = cloudAuthService.onChange((_event, session) => {
      if (session) void syncWhenPossible();
    });
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    const interval = window.setInterval(() => void syncWhenPossible(), 60_000);
    void syncWhenPossible();
    return () => {
      unsubscribe();
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(interval);
    };
  }, []);
  return null;
}
