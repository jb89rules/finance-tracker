import { NavLink } from 'react-router-dom';

const links = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/accounts', label: 'Accounts' },
  { to: '/transactions', label: 'Transactions' },
  { to: '/budgets', label: 'Budgets' },
  { to: '/bills', label: 'Bills' },
];

export default function Sidebar() {
  return (
    <aside className="w-60 shrink-0 bg-surface-800 border-r border-surface-600/60 flex flex-col">
      <div className="px-6 py-5 border-b border-surface-600/60">
        <span className="text-lg font-semibold tracking-tight text-slate-100">
          Finance
        </span>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.end}
            className={({ isActive }) =>
              [
                'block rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-surface-600 text-white'
                  : 'text-slate-400 hover:bg-surface-700 hover:text-slate-100',
              ].join(' ')
            }
          >
            {link.label}
          </NavLink>
        ))}
      </nav>
      <div className="px-6 py-4 text-xs text-slate-500 border-t border-surface-600/60">
        v0.1.0
      </div>
    </aside>
  );
}
