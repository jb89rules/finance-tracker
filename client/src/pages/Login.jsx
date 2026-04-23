import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import api from '../lib/api.js';

export default function Login() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (localStorage.getItem('auth_token')) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!password) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.post('/api/auth/login', { password });
      localStorage.setItem('auth_token', data.token);
      navigate('/', { replace: true });
    } catch (err) {
      if (err.response?.status === 401) {
        setError('Invalid password');
      } else {
        setError('Something went wrong. Try again.');
      }
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-900 p-4">
      <div className="w-full max-w-sm rounded-lg border border-surface-600/60 bg-surface-800 p-8 shadow-xl">
        <div className="mb-1 text-center text-2xl font-semibold tracking-tight text-slate-100">
          Finance Tracker
        </div>
        <div className="mb-6 text-center text-sm text-slate-500">
          Sign in to continue
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-slate-500">
              Password
            </label>
            <input
              type="password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-surface-600/60 bg-surface-700 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:ring-2 focus:ring-accent-500"
            />
          </div>

          {error && (
            <div className="rounded-md border border-red-700/50 bg-red-900/40 px-3 py-2 text-xs text-red-200">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full rounded-md bg-accent-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
