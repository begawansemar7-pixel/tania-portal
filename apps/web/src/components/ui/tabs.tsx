'use client';

import { useId, useRef, type ReactNode } from 'react';

export interface TabDefinition {
  id: string;
  label: string;
  /** Rendered as a small count beside the label. */
  count?: number;
}

/**
 * Minimal, accessible tabs: roving focus with arrow keys, Home/End support, and
 * `aria-controls` wired to the panel.
 */
export function Tabs({
  tabs,
  active,
  onChange,
  label,
  children,
  className = '',
}: {
  tabs: TabDefinition[];
  active: string;
  onChange: (id: string) => void;
  label: string;
  children: ReactNode;
  className?: string;
}) {
  const baseId = useId();
  const listRef = useRef<HTMLDivElement>(null);

  function focusTab(index: number) {
    const next = tabs[(index + tabs.length) % tabs.length];
    if (!next) return;
    onChange(next.id);
    listRef.current?.querySelector<HTMLButtonElement>(`#${CSS.escape(`${baseId}-${next.id}`)}`)?.focus();
  }

  return (
    <div className={className}>
      <div
        ref={listRef}
        role="tablist"
        aria-label={label}
        className="flex items-center gap-1 border-b border-line px-2"
        onKeyDown={(event) => {
          const index = tabs.findIndex((tab) => tab.id === active);
          if (event.key === 'ArrowRight') {
            event.preventDefault();
            focusTab(index + 1);
          } else if (event.key === 'ArrowLeft') {
            event.preventDefault();
            focusTab(index - 1);
          } else if (event.key === 'Home') {
            event.preventDefault();
            focusTab(0);
          } else if (event.key === 'End') {
            event.preventDefault();
            focusTab(tabs.length - 1);
          }
        }}
      >
        {tabs.map((tab) => {
          const selected = tab.id === active;
          return (
            <button
              key={tab.id}
              id={`${baseId}-${tab.id}`}
              role="tab"
              type="button"
              aria-selected={selected}
              aria-controls={`${baseId}-${tab.id}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(tab.id)}
              className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                selected
                  ? 'border-brand text-brand-dark'
                  : 'border-transparent text-muted hover:text-ink'
              }`}
            >
              {tab.label}
              {tab.count !== undefined ? (
                <span className="rounded-full bg-slate-100 px-1.5 text-[10px] font-bold text-slate-600">
                  {tab.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div
        id={`${baseId}-${active}-panel`}
        role="tabpanel"
        aria-labelledby={`${baseId}-${active}`}
        tabIndex={0}
        className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        {children}
      </div>
    </div>
  );
}
