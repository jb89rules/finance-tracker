export default function PageShell({ title, subtitle, action, bare = false, children }) {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-6xl px-4 pb-24 pt-6 md:px-8 md:pb-10 md:pt-10">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-3 md:mb-8 md:flex-nowrap md:gap-4">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight text-slate-100 md:text-2xl">
              {title}
            </h1>
            {subtitle && (
              <p className="mt-1 text-sm text-slate-400">{subtitle}</p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
        {bare ? (
          children
        ) : (
          <div className="rounded-lg border border-surface-600/60 bg-surface-800 p-6 text-slate-400 md:p-8">
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
