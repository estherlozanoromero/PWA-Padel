import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  failed: boolean;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) console.error(error, info);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="grid min-h-dvh place-items-center bg-mist p-6 text-ink">
        <section className="max-w-md rounded-3xl bg-white p-7 text-center shadow-card">
          <p className="text-4xl" aria-hidden="true">
            ↻
          </p>
          <h1 className="mt-3 text-2xl font-black">La aplicación necesita recuperarse</h1>
          <p className="mt-3 text-sm leading-6 text-ink/55">
            Tus datos están guardados en este dispositivo. Recarga la aplicación y vuelve a
            intentarlo.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 min-h-12 w-full rounded-xl bg-court px-4 text-sm font-black text-white"
          >
            Recargar aplicación
          </button>
          <a
            href="/settings"
            className="mt-3 inline-flex min-h-12 items-center text-sm font-black text-court"
          >
            Abrir copias de seguridad
          </a>
        </section>
      </main>
    );
  }
}
