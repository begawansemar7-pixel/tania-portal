import { VALUE_PILLARS } from '@/lib/data/portal';

/** Right-hand brand rail: the DPS promise, in TANIA's voice. */
export function ValueRail() {
  return (
    <div className="flex flex-col gap-4 self-start rounded-2xl border border-line bg-surface/80 p-5 backdrop-blur">
      <p className="font-script text-2xl leading-tight text-ink">
        &ldquo;Together
        <br />
        We Scale
        <br />
        with AI&rdquo;
      </p>
      <span className="h-0.5 w-14 rounded-full bg-telkom-red" aria-hidden />

      <ul className="mt-1 space-y-3">
        {VALUE_PILLARS.map((pillar) => {
          const Icon = pillar.icon;
          return (
            <li
              key={pillar.id}
              className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5 shadow-card"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
                <Icon className="size-5" aria-hidden />
              </span>
              <span className="text-sm leading-tight text-ink">
                <span className="block font-semibold">{pillar.title}</span>
                <span className="block text-ink-soft">{pillar.subtitle}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
