import { Link } from 'react-router-dom';

function MobileSettingsLink() {
  return (
    <Link
      to="/settings"
      aria-label="Settings"
      className="shrink-0 rounded-md p-1.5 text-slate-400 transition-colors hover:bg-surface-700 hover:text-slate-100 md:hidden"
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
      </svg>
    </Link>
  );
}

export default function PageShell({ title, subtitle, action, bare = false, children }) {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-6xl px-4 pb-24 pt-6 md:px-8 md:pb-10 md:pt-10">
        <header className="mb-6 md:mb-8">
          <div className="flex items-start justify-between gap-3 md:gap-4">
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-semibold tracking-tight text-slate-100 md:text-2xl">
                {title}
              </h1>
              {subtitle && (
                <p className="mt-1 text-sm text-slate-400">{subtitle}</p>
              )}
            </div>
            <MobileSettingsLink />
            {action && <div className="hidden shrink-0 md:block">{action}</div>}
          </div>
          {action && <div className="mt-3 md:hidden">{action}</div>}
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
