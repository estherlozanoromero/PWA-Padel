interface PlaceholderPageProps {
  eyebrow: string;
  title: string;
  description: string;
}

export function PlaceholderPage({ eyebrow, title, description }: PlaceholderPageProps) {
  return (
    <section className="rounded-[2rem] border border-ink/6 bg-white p-7 shadow-soft">
      <p className="text-xs font-black tracking-[0.2em] text-court">{eyebrow.toUpperCase()}</p>
      <h1 className="mt-2 text-3xl font-black tracking-tight">{title}</h1>
      <p className="mt-3 max-w-md text-sm leading-6 text-ink/55">{description}</p>
      <div className="mt-8 rounded-2xl bg-mist p-5 text-sm font-semibold text-ink/50">
        Esta sección se activará en la siguiente fase de implementación.
      </div>
    </section>
  );
}
