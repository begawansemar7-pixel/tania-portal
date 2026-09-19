export function PageHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <header className="mb-6">
      <p className="text-xs font-semibold tracking-[0.18em] text-brand uppercase">
        {eyebrow}
      </p>
      <h1 className="mt-2 text-2xl font-bold text-ink sm:text-3xl">{title}</h1>
      <p className="mt-2 max-w-3xl text-sm text-ink-soft">{description}</p>
    </header>
  );
}
