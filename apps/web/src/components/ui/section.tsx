import type { ReactNode } from 'react';

/**
 * A titled block of content. The heading level is explicit so pages keep a
 * correct outline for assistive technology.
 */
export function Section({
  title,
  description,
  action,
  children,
  footer,
  id,
  headingLevel = 2,
  className = '',
  bodyClassName = '',
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  id?: string;
  headingLevel?: 2 | 3;
  className?: string;
  bodyClassName?: string;
}) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const headingId = id ? `${id}-title` : undefined;

  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={`rounded-2xl border border-line bg-surface shadow-card ${className}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <Heading id={headingId} className="text-sm font-bold tracking-wide text-ink uppercase">
            {title}
          </Heading>
          {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>

      <div className={bodyClassName}>{children}</div>

      {footer ? <footer className="border-t border-line px-5 py-3">{footer}</footer> : null}
    </section>
  );
}

/** Horizontally scrollable wrapper so wide tables stay usable on small screens. */
export function TableScroll({ children }: { children: ReactNode }) {
  return (
    <div className="max-w-full overflow-x-auto scroll-slim" tabIndex={0} role="region" aria-label="Tabel data">
      {children}
    </div>
  );
}
