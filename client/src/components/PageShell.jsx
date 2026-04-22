export default function PageShell({ title, subtitle, children }) {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-6xl mx-auto px-8 py-10">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-100">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1 text-sm text-slate-400">{subtitle}</p>
          )}
        </header>
        <div className="rounded-lg border border-surface-600/60 bg-surface-800 p-8 text-slate-400">
          {children}
        </div>
      </div>
    </div>
  );
}
