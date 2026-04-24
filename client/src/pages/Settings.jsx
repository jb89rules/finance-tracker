import { useCallback, useEffect, useState } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import api from '../lib/api.js';
import formatCategory from '../lib/formatCategory.js';
import PageShell from '../components/PageShell.jsx';

const PRESET_COLORS = [
  '#6366f1',
  '#8b5cf6',
  '#ec4899',
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#14b8a6',
  '#3b82f6',
  '#6b7280',
];

const PAY_FREQUENCIES = ['Weekly', 'Bi-weekly', 'Semi-monthly', 'Monthly'];
const TYPE_OPTIONS = ['expense', 'income', 'transfer'];

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

function TrashIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function MergeIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="18" cy="18" r="3" />
      <circle cx="6" cy="6" r="3" />
      <path d="M6 21V9a9 9 0 0 0 9 9" />
    </svg>
  );
}

function Section({ title, description, children }) {
  return (
    <section className="rounded-lg border border-surface-600/60 bg-surface-800">
      <header className="border-b border-surface-600/60 px-5 py-4">
        <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
        {description && (
          <p className="mt-1 text-xs text-slate-500">{description}</p>
        )}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

function IncomeAndPaySection({ settings, onSave }) {
  const [paycheckAmount, setPaycheckAmount] = useState(
    settings.paycheckAmount ?? '0'
  );
  const [payFrequency, setPayFrequency] = useState(
    settings.payFrequency ?? 'bi-weekly'
  );
  const [lastPayDate, setLastPayDate] = useState(settings.lastPayDate ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setPaycheckAmount(settings.paycheckAmount ?? '0');
    setPayFrequency(settings.payFrequency ?? 'bi-weekly');
    setLastPayDate(settings.lastPayDate ?? '');
  }, [settings.paycheckAmount, settings.payFrequency, settings.lastPayDate]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await Promise.all([
        onSave('paycheckAmount', paycheckAmount),
        onSave('payFrequency', payFrequency),
        onSave('lastPayDate', lastPayDate),
      ]);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Section
      title="Income & pay"
      description="Used for cashflow projections"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs uppercase tracking-wide text-slate-500">
            Paycheck amount
          </span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={paycheckAmount}
            onChange={(e) => setPaycheckAmount(e.target.value)}
            className="w-full rounded-md border border-surface-600/60 bg-surface-700 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-accent-500"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs uppercase tracking-wide text-slate-500">
            Pay frequency
          </span>
          <select
            value={payFrequency}
            onChange={(e) => setPayFrequency(e.target.value)}
            className="w-full rounded-md border border-surface-600/60 bg-surface-700 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-accent-500"
          >
            {PAY_FREQUENCIES.map((f) => (
              <option key={f} value={f.toLowerCase()}>
                {f}
              </option>
            ))}
          </select>
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs uppercase tracking-wide text-slate-500">
            Last pay date
          </span>
          <input
            type="date"
            value={lastPayDate}
            onChange={(e) => setLastPayDate(e.target.value)}
            className="w-full rounded-md border border-surface-600/60 bg-surface-700 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-accent-500"
          />
        </label>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-md bg-accent-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        {saved && <span className="text-xs text-emerald-400">Saved</span>}
      </div>
    </Section>
  );
}

function ColorSwatch({ color, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-6 w-6 rounded-full border-2 transition ${
        active ? 'border-white' : 'border-transparent hover:border-slate-500'
      }`}
      style={{ backgroundColor: color }}
      title={color}
    />
  );
}

function ColorPicker({ color, onChange }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="block h-5 w-5 rounded-full border border-surface-500 transition hover:border-slate-300"
        style={{ backgroundColor: color }}
        title="Change color"
      />
      {open && (
        <div
          className="absolute left-0 top-full z-20 mt-2 grid grid-cols-5 gap-1.5 rounded-md border border-surface-600/60 bg-surface-700 p-2 shadow-lg"
          onMouseLeave={() => setOpen(false)}
        >
          {PRESET_COLORS.map((c) => (
            <ColorSwatch
              key={c}
              color={c}
              active={c === color}
              onClick={() => {
                onChange(c);
                setOpen(false);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CategoryRow({ category, categories, onPatch, onDelete, onMerge }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(category.name);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);

  useEffect(() => {
    setName(category.name);
  }, [category.name]);

  const commitName = async () => {
    setEditing(false);
    if (name.trim() && name.trim() !== category.name) {
      await onPatch(category.id, { name: name.trim() });
    } else {
      setName(category.name);
    }
  };

  return (
    <div className="flex items-center gap-3 border-b border-surface-600/60 py-2.5 last:border-0">
      <ColorPicker
        color={category.color}
        onChange={(color) => onPatch(category.id, { color })}
      />
      <div className="min-w-0 flex-1">
        {editing ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitName();
              if (e.key === 'Escape') {
                setEditing(false);
                setName(category.name);
              }
            }}
            className="w-full rounded bg-surface-700 px-2 py-1 text-sm text-slate-100 outline-none ring-1 ring-surface-500 focus:ring-accent-500"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="truncate text-left text-sm text-slate-100 hover:text-accent-400"
          >
            {formatCategory(category.name)}
          </button>
        )}
      </div>
      <select
        value={category.type}
        onChange={(e) => onPatch(category.id, { type: e.target.value })}
        className="rounded-md border border-surface-600/60 bg-surface-700 px-2 py-1 text-xs text-slate-200 outline-none focus:ring-2 focus:ring-accent-500"
      >
        {TYPE_OPTIONS.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => setMergeOpen(true)}
        title="Merge"
        className="rounded p-1 text-slate-500 transition-colors hover:bg-surface-700 hover:text-slate-200"
      >
        <MergeIcon />
      </button>
      <button
        type="button"
        onClick={() => setDeleteOpen(true)}
        title="Delete"
        className="rounded p-1 text-slate-500 transition-colors hover:bg-surface-700 hover:text-red-400"
      >
        <TrashIcon />
      </button>

      {deleteOpen && (
        <DeleteCategoryModal
          category={category}
          categories={categories.filter((c) => c.id !== category.id)}
          onClose={() => setDeleteOpen(false)}
          onConfirm={async (reassignTo) => {
            await onDelete(category.id, reassignTo);
            setDeleteOpen(false);
          }}
        />
      )}
      {mergeOpen && (
        <MergeCategoryModal
          category={category}
          categories={categories.filter((c) => c.id !== category.id)}
          onClose={() => setMergeOpen(false)}
          onConfirm={async (targetId) => {
            await onMerge(category.id, targetId);
            setMergeOpen(false);
          }}
        />
      )}
    </div>
  );
}

function ChoiceModal({ title, message, options, confirmLabel, confirmColor, onClose, onConfirm }) {
  const [selected, setSelected] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const handle = async () => {
    if (!selected) return setError('Select a category');
    setSaving(true);
    setError(null);
    try {
      await onConfirm(selected);
    } catch (e) {
      setError('Failed — try again');
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-lg border border-surface-600/60 bg-surface-800 p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 text-sm font-semibold text-slate-100">{title}</div>
        <p className="mb-4 text-xs text-slate-400">{message}</p>
        <select
          autoFocus
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="mb-3 w-full rounded-md border border-surface-600/60 bg-surface-700 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-accent-500"
        >
          <option value="">Select a category</option>
          {options.map((c) => (
            <option key={c.id} value={c.id}>
              {formatCategory(c.name)}
            </option>
          ))}
        </select>
        {error && (
          <div className="mb-3 rounded-md border border-red-700/50 bg-red-900/40 px-3 py-2 text-xs text-red-200">
            {error}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-surface-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handle}
            disabled={saving || !selected}
            className={`rounded-md px-3 py-1.5 text-xs font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              confirmColor === 'red'
                ? 'bg-red-500 hover:bg-red-600'
                : 'bg-accent-500 hover:bg-accent-600'
            }`}
          >
            {saving ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteCategoryModal({ category, categories, onClose, onConfirm }) {
  return (
    <ChoiceModal
      title={`Delete "${formatCategory(category.name)}"`}
      message="Transactions currently categorized with this will be reassigned to the category you pick below."
      options={categories}
      confirmLabel="Delete"
      confirmColor="red"
      onClose={onClose}
      onConfirm={async (selectedId) => {
        const target = categories.find((c) => c.id === selectedId);
        if (!target) return;
        await onConfirm(target.name);
      }}
    />
  );
}

function MergeCategoryModal({ category, categories, onClose, onConfirm }) {
  return (
    <ChoiceModal
      title={`Merge "${formatCategory(category.name)}" into…`}
      message="All transactions will be moved to the target category, and this category will be deleted."
      options={categories}
      confirmLabel="Merge"
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}

function CategoryManagementSection({ categories, onReload, onError }) {
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
  const [newType, setNewType] = useState('expense');
  const [creating, setCreating] = useState(false);

  const handleAdd = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await api.post('/api/categories', {
        name: newName.trim(),
        color: newColor,
        type: newType,
      });
      setNewName('');
      setNewColor(PRESET_COLORS[0]);
      setNewType('expense');
      await onReload();
    } catch (e) {
      onError(e.response?.data?.error || 'Failed to add category');
    } finally {
      setCreating(false);
    }
  };

  const handlePatch = async (id, data) => {
    try {
      await api.patch(`/api/categories/${id}`, data);
      await onReload();
    } catch (e) {
      onError(e.response?.data?.error || 'Failed to update category');
    }
  };

  const handleDelete = async (id, reassignTo) => {
    try {
      await api.delete(`/api/categories/${id}`, { data: { reassignTo } });
      await onReload();
    } catch (e) {
      onError(e.response?.data?.error || 'Failed to delete category');
    }
  };

  const handleMerge = async (sourceId, targetId) => {
    try {
      await api.post('/api/categories/merge', { sourceId, targetId });
      await onReload();
    } catch (e) {
      onError(e.response?.data?.error || 'Failed to merge categories');
    }
  };

  return (
    <Section
      title="Categories"
      description="Rename inline, change color, or reassign/merge"
    >
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <ColorPicker color={newColor} onChange={setNewColor} />
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New category name"
          className="min-w-[150px] flex-1 rounded-md border border-surface-600/60 bg-surface-700 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-accent-500"
        />
        <select
          value={newType}
          onChange={(e) => setNewType(e.target.value)}
          className="rounded-md border border-surface-600/60 bg-surface-700 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-accent-500"
        >
          {TYPE_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleAdd}
          disabled={creating || !newName.trim()}
          className="rounded-md bg-accent-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Add
        </button>
      </div>
      {categories.length === 0 ? (
        <div className="py-6 text-center text-xs text-slate-500">
          No categories yet.
        </div>
      ) : (
        <div>
          {categories.map((c) => (
            <CategoryRow
              key={c.id}
              category={c}
              categories={categories}
              onPatch={handlePatch}
              onDelete={handleDelete}
              onMerge={handleMerge}
            />
          ))}
        </div>
      )}
    </Section>
  );
}

function TransferExclusionRulesSection({ settings, onSave }) {
  const initial = (() => {
    try {
      const parsed = JSON.parse(settings.excludedDescriptions || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  })();
  const [rules, setRules] = useState(initial);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      const parsed = JSON.parse(settings.excludedDescriptions || '[]');
      setRules(Array.isArray(parsed) ? parsed : []);
    } catch {
      setRules([]);
    }
  }, [settings.excludedDescriptions]);

  const addRule = () => {
    const v = draft.trim();
    if (!v || rules.includes(v)) return;
    setRules([...rules, v]);
    setDraft('');
  };

  const removeRule = (pattern) => {
    setRules(rules.filter((r) => r !== pattern));
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await onSave('excludedDescriptions', JSON.stringify(rules));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Section
      title="Transfer exclusion rules"
      description="Transaction descriptions that should be treated as internal transfers"
    >
      <div className="mb-3 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addRule()}
          placeholder="e.g. To Checking -"
          className="min-w-0 flex-1 rounded-md border border-surface-600/60 bg-surface-700 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-accent-500"
        />
        <button
          type="button"
          onClick={addRule}
          disabled={!draft.trim()}
          className="rounded-md border border-surface-600/60 bg-surface-700 px-3 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-surface-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Add rule
        </button>
      </div>
      {rules.length === 0 ? (
        <div className="rounded-md border border-dashed border-surface-600/60 py-4 text-center text-xs text-slate-500">
          No exclusion rules.
        </div>
      ) : (
        <ul className="space-y-1">
          {rules.map((pattern) => (
            <li
              key={pattern}
              className="flex items-center justify-between gap-2 rounded-md bg-surface-700/40 px-3 py-2 text-sm"
            >
              <span className="truncate text-slate-200">{pattern}</span>
              <button
                type="button"
                onClick={() => removeRule(pattern)}
                className="shrink-0 rounded p-1 text-slate-500 transition-colors hover:bg-surface-700 hover:text-red-400"
              >
                <TrashIcon />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-md bg-accent-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save rules'}
        </button>
        {saved && <span className="text-xs text-emerald-400">Saved</span>}
      </div>
    </Section>
  );
}

function DefaultBillSettingsSection({ settings, onSave }) {
  const [window, setWindow] = useState(settings.defaultPaymentWindow ?? '3');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setWindow(settings.defaultPaymentWindow ?? '3');
  }, [settings.defaultPaymentWindow]);

  const handleSave = async () => {
    const n = Number.parseInt(window, 10);
    if (!Number.isInteger(n) || n < 1 || n > 14) return;
    setSaving(true);
    setSaved(false);
    try {
      await onSave('defaultPaymentWindow', String(n));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Section title="Bill defaults" description="Applied when creating new bills">
      <label className="block max-w-xs">
        <span className="mb-1 block text-xs uppercase tracking-wide text-slate-500">
          Default payment detection window (days)
        </span>
        <input
          type="number"
          min="1"
          max="14"
          value={window}
          onChange={(e) => setWindow(e.target.value)}
          className="w-full rounded-md border border-surface-600/60 bg-surface-700 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-accent-500"
        />
      </label>
      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-md bg-accent-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        {saved && <span className="text-xs text-emerald-400">Saved</span>}
      </div>
    </Section>
  );
}

function AccountsSection({ onError }) {
  const [data, setData] = useState({ total: 0, institutions: [] });
  const [failedItemIds, setFailedItemIds] = useState(() => new Set());
  const [linkToken, setLinkToken] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingItemId, setUpdatingItemId] = useState(null);
  const [disconnectingItemId, setDisconnectingItemId] = useState(null);

  const loadBalances = useCallback(async () => {
    try {
      const { data: resp } = await api.get('/api/plaid/balances');
      setData(resp);
    } catch (e) {
      onError('Failed to load balances');
    }
  }, [onError]);

  const doRefresh = useCallback(async () => {
    const { data: resp } = await api.post('/api/plaid/refresh-balances');
    const failed = Array.isArray(resp.failed) ? resp.failed : [];
    setFailedItemIds(new Set(failed.map((f) => f.itemId)));
    await loadBalances();
  }, [loadBalances]);

  useEffect(() => {
    loadBalances();
  }, [loadBalances]);

  const onSuccess = useCallback(
    async (public_token, metadata) => {
      if (updatingItemId) {
        setUpdatingItemId(null);
        setLinkToken(null);
        try {
          await doRefresh();
        } catch (e) {
          onError('Reconnected, but failed to refresh');
        }
        return;
      }
      setConnecting(true);
      try {
        await api.post('/api/plaid/exchange-token', {
          public_token,
          institution_name: metadata.institution?.name || 'Unknown',
          accounts: metadata.accounts,
        });
        setLinkToken(null);
        await doRefresh();
      } catch (e) {
        onError('Failed to connect account');
      } finally {
        setConnecting(false);
      }
    },
    [updatingItemId, doRefresh, onError]
  );

  const onExit = useCallback(() => {
    setLinkToken(null);
    setConnecting(false);
    setUpdatingItemId(null);
  }, []);

  const { open, ready } = usePlaidLink({ token: linkToken, onSuccess, onExit });

  useEffect(() => {
    if (linkToken && ready) open();
  }, [linkToken, ready, open]);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const { data: resp } = await api.post('/api/plaid/create-link-token');
      setLinkToken(resp.link_token);
    } catch (e) {
      onError('Failed to create link token');
      setConnecting(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await doRefresh();
    } catch (e) {
      onError('Failed to refresh balances');
    } finally {
      setRefreshing(false);
    }
  };

  const handleReconnect = async (itemId) => {
    setUpdatingItemId(itemId);
    try {
      const { data: resp } = await api.post(
        '/api/plaid/create-link-token-update',
        { itemId }
      );
      setLinkToken(resp.link_token);
    } catch (e) {
      onError('Failed to start reconnect');
      setUpdatingItemId(null);
    }
  };

  const handleDisconnect = async (itemId) => {
    if (!confirm('Disconnect this institution? Transaction history is kept.')) return;
    setDisconnectingItemId(itemId);
    try {
      await api.post('/api/plaid/disconnect-item', { itemId });
      await loadBalances();
    } catch (e) {
      onError('Failed to disconnect');
    } finally {
      setDisconnectingItemId(null);
    }
  };

  return (
    <Section title="Connected accounts" description="Manage bank connections">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">
            Total balance
          </div>
          <div
            className={`text-xl font-semibold tabular-nums ${
              data.total >= 0 ? 'text-slate-100' : 'text-red-400'
            }`}
          >
            {currencyFormatter.format(data.total)}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing || data.institutions.length === 0}
            className="rounded-md border border-surface-600/60 bg-surface-700 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-surface-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
          <button
            type="button"
            onClick={handleConnect}
            disabled={connecting}
            className="rounded-md bg-accent-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {connecting ? 'Connecting…' : 'Connect'}
          </button>
        </div>
      </div>

      {data.institutions.length === 0 ? (
        <div className="rounded-md border border-dashed border-surface-600/60 py-6 text-center text-xs text-slate-500">
          No accounts connected yet.
        </div>
      ) : (
        <div className="space-y-3">
          {data.institutions.map((inst) => {
            const failedIds = [
              ...new Set(
                inst.accounts
                  .map((a) => a.itemId)
                  .filter((id) => id && failedItemIds.has(id))
              ),
            ];
            const itemId = inst.accounts.find((a) => a.itemId)?.itemId;
            const needsReconnect = failedIds.length > 0;
            const isUpdatingThis = updatingItemId && failedIds.includes(updatingItemId);
            const isDisconnectingThis = disconnectingItemId === itemId;
            return (
              <div
                key={inst.name}
                className="rounded-md border border-surface-600/60 bg-surface-700/40 p-3"
              >
                <div className="flex items-baseline justify-between">
                  <div className="text-sm font-semibold text-slate-200">{inst.name}</div>
                  <div className="text-sm tabular-nums text-slate-400">
                    {currencyFormatter.format(inst.total)}
                  </div>
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {inst.accounts.length} account{inst.accounts.length === 1 ? '' : 's'}
                </div>
                {needsReconnect && (
                  <div className="mt-2 text-xs text-amber-300">
                    Reconnection required.
                  </div>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  {needsReconnect && (
                    <button
                      type="button"
                      onClick={() => handleReconnect(failedIds[0])}
                      disabled={isUpdatingThis}
                      className="rounded-md bg-amber-500 px-2.5 py-1 text-xs font-medium text-surface-900 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isUpdatingThis ? 'Opening…' : 'Reconnect'}
                    </button>
                  )}
                  {itemId && (
                    <button
                      type="button"
                      onClick={() => handleDisconnect(itemId)}
                      disabled={isDisconnectingThis}
                      className="rounded-md border border-surface-600/60 bg-surface-700 px-2.5 py-1 text-xs text-slate-300 hover:bg-surface-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isDisconnectingThis ? 'Disconnecting…' : 'Disconnect'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}

function MerchantRulesSection({ onError }) {
  const [rules, setRules] = useState([]);
  const [newDescription, setNewDescription] = useState('');
  const [newOverride, setNewOverride] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/api/merchant-rules');
      setRules(data);
    } catch (e) {
      onError('Failed to load merchant rules');
    }
  }, [onError]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAdd = async () => {
    if (!newDescription.trim() || !newOverride.trim()) return;
    setSaving(true);
    try {
      await api.post('/api/merchant-rules', {
        description: newDescription.trim(),
        merchantOverride: newOverride.trim(),
      });
      setNewDescription('');
      setNewOverride('');
      await load();
    } catch (e) {
      onError(e.response?.data?.error || 'Failed to save merchant rule');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/api/merchant-rules/${id}`);
      await load();
    } catch (e) {
      onError('Failed to delete merchant rule');
    }
  };

  return (
    <Section
      title="Merchant rules"
      description="Auto-apply a clean display name whenever a transaction description matches"
    >
      <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <input
          value={newDescription}
          onChange={(e) => setNewDescription(e.target.value)}
          placeholder="Bank description"
          className="rounded-md border border-surface-600/60 bg-surface-700 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-accent-500"
        />
        <input
          value={newOverride}
          onChange={(e) => setNewOverride(e.target.value)}
          placeholder="Display as"
          className="rounded-md border border-surface-600/60 bg-surface-700 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-accent-500"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={saving || !newDescription.trim() || !newOverride.trim()}
          className="rounded-md bg-accent-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Add rule
        </button>
      </div>
      {rules.length === 0 ? (
        <div className="rounded-md border border-dashed border-surface-600/60 py-4 text-center text-xs text-slate-500">
          No merchant rules yet.
        </div>
      ) : (
        <ul className="divide-y divide-surface-600/60">
          {rules.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between gap-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-slate-200">
                  {r.description}
                </div>
                <div className="truncate text-xs text-slate-500">
                  → {r.merchantOverride}
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(r.id)}
                className="shrink-0 rounded p-1 text-slate-500 transition-colors hover:bg-surface-700 hover:text-red-400"
              >
                <TrashIcon />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

export default function Settings() {
  const [settings, setSettings] = useState({});
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState(null);

  const loadSettings = useCallback(async () => {
    try {
      const { data } = await api.get('/api/settings');
      setSettings(data);
    } catch (e) {
      setError('Failed to load settings');
    }
  }, []);

  const loadCategories = useCallback(async () => {
    try {
      const { data } = await api.get('/api/categories');
      setCategories(data);
    } catch (e) {
      /* non-fatal */
    }
  }, []);

  useEffect(() => {
    loadSettings();
    loadCategories();
  }, [loadSettings, loadCategories]);

  const handleSaveSetting = async (key, value) => {
    await api.post('/api/settings', { key, value });
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <PageShell title="Settings" subtitle="Configure the app to match your finances" bare>
      {error && (
        <div className="mb-4 rounded-md border border-red-700/50 bg-red-900/40 px-4 py-2 text-sm text-red-200">
          {error}
        </div>
      )}
      <div className="space-y-5">
        <IncomeAndPaySection settings={settings} onSave={handleSaveSetting} />
        <CategoryManagementSection
          categories={categories}
          onReload={loadCategories}
          onError={setError}
        />
        <MerchantRulesSection onError={setError} />
        <TransferExclusionRulesSection settings={settings} onSave={handleSaveSetting} />
        <DefaultBillSettingsSection settings={settings} onSave={handleSaveSetting} />
        <AccountsSection onError={setError} />
      </div>
    </PageShell>
  );
}
