export function PortalFooter() {
  const items = ['Digital Product & Solution', 'Stronger People', 'Smarter Ways', 'Bigger Impact'];

  return (
    <footer className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-line px-1 py-5 text-xs text-muted">
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {items.map((item) => (
          <li key={item} className="border-line not-last:border-r not-last:pr-4">
            {item}
          </li>
        ))}
      </ul>
      <p className="flex items-center gap-2 font-medium text-ink-soft">
        <span className="size-2 rounded-full bg-success" aria-hidden />
        TANIA is online
      </p>
    </footer>
  );
}
