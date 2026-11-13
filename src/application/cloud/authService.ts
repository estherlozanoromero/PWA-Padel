import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { ApplicationError } from '@/application/errors';
import { cloudConfigured, supabase } from '@/infrastructure/cloud/supabaseClient';

export class CloudAuthService {
  readonly configured = cloudConfigured;

  async session(): Promise<Session | null> {
    if (!supabase) return null;
    const { data, error } = await supabase.auth.getSession();
    if (error) throw new ApplicationError('STORAGE_ERROR', error.message);
    return data.session;
  }

  async sendMagicLink(email: string, displayName: string): Promise<void> {
    if (!supabase) {
      throw new ApplicationError('STORAGE_ERROR', 'La sincronización todavía no está configurada.');
    }
    const normalizedEmail = email.trim().toLocaleLowerCase('es');
    if (!normalizedEmail.includes('@')) {
      throw new ApplicationError('VALIDATION_ERROR', 'Introduce un correo electrónico válido.');
    }
    const { error } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        emailRedirectTo: `${window.location.origin}/settings`,
        data: { display_name: displayName.trim() || normalizedEmail.split('@')[0] },
      },
    });
    if (error) throw new ApplicationError('STORAGE_ERROR', error.message);
  }

  async signOut(): Promise<void> {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) throw new ApplicationError('STORAGE_ERROR', error.message);
  }

  onChange(callback: (event: AuthChangeEvent, session: Session | null) => void) {
    if (!supabase) return () => undefined;
    const { data } = supabase.auth.onAuthStateChange(callback);
    return () => data.subscription.unsubscribe();
  }
}

export const cloudAuthService = new CloudAuthService();
