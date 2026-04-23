import { useCallback, useEffect, useState } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import api from '../lib/api.js';
import PageShell from '../components/PageShell.jsx';

export default function Accounts() {
  const [accounts, setAccounts] = useState([]);
  const [linkToken, setLinkToken] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadAccounts = useCallback(async () => {
    try {
      const { data } = await api.get('/api/plaid/accounts');
      setAccounts(data);
    } catch (e) {
      setError('Failed to load accounts');
    }
  }, []);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  const onSuccess = useCallback(
    async (public_token, metadata) => {
      setLoading(true);
      try {
        await api.post('/api/plaid/exchange-token', {
          public_token,
          institution_name: metadata.institution?.name || 'Unknown',
          accounts: metadata.accounts,
        });
        setLinkToken(null);
        await loadAccounts();
      } catch (e) {
        setError('Failed to connect account');
      } finally {
        setLoading(false);
      }
    },
    [loadAccounts]
  );

  const onExit = useCallback(() => {
    setLinkToken(null);
    setLoading(false);
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
    setLoading(true);
    try {
      const { data } = await api.post('/api/plaid/create-link-token');
      setLinkToken(data.link_token);
    } catch (e) {
      setError('Failed to create link token');
      setLoading(false);
    }
  };

  return (
    <PageShell title="Accounts" subtitle="Linked bank and manual accounts">
      <div className="mb-6 flex items-center justify-between">
        <div className="text-sm text-slate-400">
          {accounts.length} connected account{accounts.length === 1 ? '' : 's'}
        </div>
        <button
          onClick={handleConnect}
          disabled={loading}
          className="rounded-md bg-accent-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? 'Connecting…' : 'Connect Account'}
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-700/50 bg-red-900/40 px-4 py-2 text-sm text-red-200">
          {error}
        </div>
      )}

      {accounts.length === 0 ? (
        <div className="py-10 text-center text-sm text-slate-500">
          No accounts connected yet. Click "Connect Account" to link a bank via Plaid.
        </div>
      ) : (
        <ul className="divide-y divide-surface-600/60">
          {accounts.map((a) => (
            <li key={a.id} className="flex items-center justify-between py-3">
              <div>
                <div className="font-medium text-slate-100">{a.name}</div>
                <div className="text-xs text-slate-500">{a.institution}</div>
              </div>
              <div className="text-xs uppercase tracking-wide text-slate-500">
                {a.type}
              </div>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
