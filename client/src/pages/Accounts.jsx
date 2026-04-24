import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
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
  const [updatingItemId, setUpdatingItemId] = useState(null);
  const [failedItemIds, setFailedItemIds] = useState(() => new Set());
  const [error, setError] = useState(null);

  const loadBalances = useCallback(async () => {
    try {
      const { data: resp } = await api.get('/api/plaid/balances');
      setData(resp);
    } catch (e) {
      setError('Failed to load balances');
    }
  }, []);

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
          setError('Reconnected, but failed to refresh');
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
        setError('Failed to connect account');
      } finally {
        setConnecting(false);
      }
    },
    [updatingItemId, doRefresh]
  );

  const onExit = useCallback(() => {
    setLinkToken(null);
    setConnecting(false);
    setUpdatingItemId(null);
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
      await doRefresh();
    } catch (e) {
      setError('Failed to refresh balances');
    } finally {
      setRefreshing(false);
    }
  };

  const handleReconnect = async (itemId) => {
    setError(null);
    setUpdatingItemId(itemId);
    try {
      const { data: resp } = await api.post(
        '/api/plaid/create-link-token-update',
        { itemId }
      );
      setLinkToken(resp.link_token);
    } catch (e) {
      setError('Failed to start reconnect');
      setUpdatingItemId(null);
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

      <div className="mb-4 text-right text-xs">
        <Link
          to="/settings"
          className="text-accent-400 hover:text-accent-300"
        >
          Manage connections → Settings
        </Link>
      </div>

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
          {data.institutions.map((inst) => {
            const failedForInst = [
              ...new Set(
                inst.accounts
                  .map((a) => a.itemId)
                  .filter((id) => id && failedItemIds.has(id))
              ),
            ];
            const needsReconnect = failedForInst.length > 0;
            const firstFailedItem = failedForInst[0];
            const isUpdatingThis = updatingItemId === firstFailedItem;

            return (
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
                {needsReconnect && (
                  <div className="flex flex-col gap-2 border-b border-amber-700/40 bg-amber-900/20 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-xs text-amber-200">
                      <span className="font-medium">
                        Reconnection required.
                      </span>{' '}
                      Plaid needs you to sign in again to refresh this
                      institution. Transactions and history will be preserved.
                    </div>
                    <button
                      type="button"
                      onClick={() => handleReconnect(firstFailedItem)}
                      disabled={isUpdatingThis}
                      className="shrink-0 rounded-md bg-amber-500 px-3 py-1.5 text-xs font-medium text-surface-900 transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isUpdatingThis ? 'Opening…' : 'Reconnect'}
                    </button>
                  </div>
                )}
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
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
