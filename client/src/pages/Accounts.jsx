import { useCallback, useEffect, useState } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import api from '../lib/api.js';
import PageShell from '../components/PageShell.jsx';

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

function formatBalance(n) {
  if (n === null || n === undefined) return '—';
  return currencyFormatter.format(n);
}

export default function Accounts() {
  const [data, setData] = useState({ total: 0, institutions: [] });
  const [linkToken, setLinkToken] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const loadBalances = useCallback(async () => {
    try {
      const { data: resp } = await api.get('/api/plaid/balances');
      setData(resp);
    } catch (e) {
      setError('Failed to load balances');
    }
  }, []);

  useEffect(() => {
    loadBalances();
  }, [loadBalances]);

  const onSuccess = useCallback(
    async (public_token, metadata) => {
      setConnecting(true);
      try {
        await api.post('/api/plaid/exchange-token', {
          public_token,
          institution_name: metadata.institution?.name || 'Unknown',
          accounts: metadata.accounts,
        });
        setLinkToken(null);
        await loadBalances();
      } catch (e) {
        setError('Failed to connect account');
      } finally {
        setConnecting(false);
      }
    },
    [loadBalances]
  );

  const onExit = useCallback(() => {
    setLinkToken(null);
    setConnecting(false);
  }, []);

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
    onExit,
  });

  useEffect(() => {
    if (linkToken && ready) {
      open();
    }
  }, [linkToken, ready, open]);

  const handleConnect = async () => {
    setError(null);
    setConnecting(true);
    try {
      const { data: resp } = await api.post('/api/plaid/create-link-token');
      setLinkToken(resp.link_token);
    } catch (e) {
      setError('Failed to create link token');
      setConnecting(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    setError(null);
    try {
      await api.post('/api/plaid/refresh-balances');
      await loadBalances();
    } catch (e) {
      setError('Failed to refresh balances');
    } finally {
      setRefreshing(false);
    }
  };

  const totalAccounts = data.institutions.reduce(
    (n, inst) => n + inst.accounts.length,
    0
  );

  const headerActions = (
    <div className="flex gap-2">
      <button
        onClick={handleRefresh}
        disabled={refreshing || totalAccounts === 0}
        className="rounded-md border border-surface-600/60 bg-surface-700 px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-surface-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {refreshing ? 'Refreshing…' : 'Refresh Balances'}
      </button>
      <button
        onClick={handleConnect}
        disabled={connecting}
        className="rounded-md bg-accent-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {connecting ? 'Connecting…' : 'Connect Account'}
      </button>
    </div>
  );

  return (
    <PageShell title="Accounts" action={headerActions} bare>
      {error && (
        <div className="mb-4 rounded-md border border-red-700/50 bg-red-900/40 px-4 py-2 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="mb-6 rounded-lg border border-surface-600/60 bg-surface-800 px-5 py-4">
        <div className="text-xs uppercase tracking-wide text-slate-500">
          Total balance
        </div>
        <div
          className={`mt-1 text-3xl font-semibold tabular-nums ${
            data.total >= 0 ? 'text-slate-100' : 'text-red-400'
          }`}
        >
          {formatBalance(data.total)}
        </div>
        <div className="mt-1 text-xs text-slate-500">
          {totalAccounts} account{totalAccounts === 1 ? '' : 's'} across{' '}
          {data.institutions.length} institution
          {data.institutions.length === 1 ? '' : 's'}
        </div>
      </div>

      {totalAccounts === 0 ? (
        <div className="rounded-lg border border-dashed border-surface-600/60 bg-surface-800/40 py-16 text-center">
          <div className="text-sm text-slate-400">
            No accounts connected yet.
          </div>
          <button
            onClick={handleConnect}
            disabled={connecting}
            className="mt-4 rounded-md bg-accent-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Connect your first account
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {data.institutions.map((inst) => (
            <div
              key={inst.name}
              className="overflow-hidden rounded-lg border border-surface-600/60 bg-surface-800"
            >
              <div className="flex items-baseline justify-between border-b border-surface-600/60 px-5 py-3">
                <div className="text-sm font-semibold text-slate-200">
                  {inst.name}
                </div>
                <div className="text-sm tabular-nums text-slate-400">
                  {formatBalance(inst.total)}
                </div>
              </div>
              <ul className="divide-y divide-surface-600/60">
                {inst.accounts.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center justify-between gap-3 px-5 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="truncate text-sm font-medium text-slate-100">
                          {a.name}
                        </div>
                        {a.accountNumber && (
                          <span className="shrink-0 text-xs text-slate-500">
                            ••••{a.accountNumber}
                          </span>
                        )}
                      </div>
                      <div className="text-xs uppercase tracking-wide text-slate-500">
                        {a.type}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-sm font-medium tabular-nums text-slate-100">
                        {formatBalance(a.balance)}
                      </div>
                      {a.availableBalance !== null &&
                        a.availableBalance !== undefined &&
                        a.availableBalance !== a.balance && (
                          <div className="text-xs text-slate-500">
                            {formatBalance(a.availableBalance)} available
                          </div>
                        )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </PageShell>
  );
}
