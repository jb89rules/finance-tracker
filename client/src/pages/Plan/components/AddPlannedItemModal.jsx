import { useState } from 'react';
import api from '../../../lib/api.js';
import Modal from '../../../components/Modal.jsx';
import CategoryCombobox from '../../../components/CategoryCombobox.jsx';
import { SHORT_MONTH_LABELS } from '../../../lib/format.js';

function inferFrequencyFromAmounts(amounts) {
  if (!Array.isArray(amounts) || amounts.length !== 12) return 'monthly';
  const nonZero = amounts.map((a, i) => (a > 0 ? i : -1)).filter((i) => i >= 0);
  if (nonZero.length === 12) {
    const first = amounts[0];
    return amounts.every((a) => a === first) ? 'monthly' : 'custom';
  }
  if (nonZero.length === 1) return 'annual';
  if (nonZero.length === 2 && amounts[nonZero[0]] === amounts[nonZero[1]]) {
    return 'semi-annual';
  }
  return 'custom';
}

function buildMonthlyAmounts(frequency, amount, anchorMonths, customAmounts) {
  if (frequency === 'monthly') {
    return Array.from({ length: 12 }, () => amount);
  }
  if (frequency === 'annual' || frequency === 'semi-annual') {
    const result = Array.from({ length: 12 }, () => 0);
    for (const m of anchorMonths) {
      if (m >= 0 && m < 12) result[m] = amount;
    }
    return result;
  }
  return customAmounts.map((a) => Number.parseFloat(a) || 0);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function AddPlannedItemModal({
  initial,
  defaultCategory,
  categories,
  onSubmit,
  onClose,
}) {
  const initialAmounts =
    Array.isArray(initial?.monthlyAmounts) && initial.monthlyAmounts.length === 12
      ? initial.monthlyAmounts
      : Array.from({ length: 12 }, () => initial?.amount ?? 0);
  const initialFreq =
    initial?.frequency || inferFrequencyFromAmounts(initialAmounts);
  const initialNonZero = initialAmounts
    .map((a, i) => (a > 0 ? i : -1))
    .filter((i) => i >= 0);
  const initialAnchor = initialNonZero.length > 0 ? initialAmounts[initialNonZero[0]] : 0;

  const [kind, setKind] = useState(initial?.kind || 'recurring');
  const [name, setName] = useState(initial?.name ?? '');
  const [category, setCategory] = useState(initial?.category ?? defaultCategory ?? '');

  // Recurring fields
  const [frequency, setFrequency] = useState(initialFreq);
  const [amount, setAmount] = useState(
    initialFreq === 'custom'
      ? ''
      : String(initialFreq === 'monthly' ? initialAmounts[0] || '' : initialAnchor || '')
  );
  const [annualMonth, setAnnualMonth] = useState(
    initialFreq === 'annual' && initialNonZero.length > 0 ? initialNonZero[0] : 0
  );
  const [semiMonth1, setSemiMonth1] = useState(
    initialFreq === 'semi-annual' && initialNonZero.length >= 1 ? initialNonZero[0] : 0
  );
  const [semiMonth2, setSemiMonth2] = useState(
    initialFreq === 'semi-annual' && initialNonZero.length >= 2 ? initialNonZero[1] : 6
  );
  const [customAmounts, setCustomAmounts] = useState(() =>
    initialAmounts.map((a) => String(a || ''))
  );
  const [dueDay, setDueDay] = useState(
    initial?.dueDay !== null && initial?.dueDay !== undefined ? String(initial.dueDay) : ''
  );
  const [scheduled, setScheduled] = useState(
    initial ? initial.dueDay !== null && initial.dueDay !== undefined : true
  );

  // One-time fields
  const [oneTimeDate, setOneTimeDate] = useState(
    initial?.oneTimeDate ? new Date(initial.oneTimeDate).toISOString().slice(0, 10) : todayIso()
  );
  const [oneTimeAmount, setOneTimeAmount] = useState(
    initial?.kind === 'one_time' ? String(initial.amount ?? '') : ''
  );

  // Common fields
  const [matchKeyword, setMatchKeyword] = useState(initial?.matchKeyword ?? '');
  const [paymentWindowDays, setPaymentWindowDays] = useState(
    initial?.paymentWindowDays !== undefined ? String(initial.paymentWindowDays) : '3'
  );
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Name is required');
      return;
    }

    let payload = {
      name: name.trim(),
      category: category.trim() || null,
      kind,
      matchKeyword: matchKeyword.trim() || null,
      isActive,
    };

    if (kind === 'recurring') {
      let amountNum = 0;
      let anchorMonths = [];
      if (frequency === 'monthly' || frequency === 'annual') {
        amountNum = Number.parseFloat(amount);
        if (!Number.isFinite(amountNum) || amountNum < 0) {
          setError('Amount must be 0 or greater');
          return;
        }
        if (frequency === 'annual') anchorMonths = [annualMonth];
      } else if (frequency === 'semi-annual') {
        amountNum = Number.parseFloat(amount);
        if (!Number.isFinite(amountNum) || amountNum < 0) {
          setError('Amount must be 0 or greater');
          return;
        }
        if (semiMonth1 === semiMonth2) {
          setError('Semi-annual must use two different months');
          return;
        }
        anchorMonths = [semiMonth1, semiMonth2];
      } else if (frequency === 'custom') {
        const parsed = customAmounts.map((a) => Number.parseFloat(a));
        if (parsed.some((a) => !Number.isFinite(a) || a < 0)) {
          setError('Custom amounts must each be 0 or greater');
          return;
        }
      }

      payload.frequency = frequency;
      payload.monthlyAmounts = buildMonthlyAmounts(frequency, amountNum, anchorMonths, customAmounts);

      if (scheduled) {
        const dayNum = Number.parseInt(dueDay, 10);
        if (!Number.isInteger(dayNum) || dayNum < 1 || dayNum > 31) {
          setError('Due day must be 1-31');
          return;
        }
        payload.dueDay = dayNum;

        const windowNum = Number.parseInt(paymentWindowDays, 10);
        if (!Number.isInteger(windowNum) || windowNum < 1 || windowNum > 14) {
          setError('Payment window must be 1-14 days');
          return;
        }
        payload.paymentWindowDays = windowNum;
      } else {
        payload.dueDay = null;
      }
    } else {
      // one_time
      const amountNum = Number.parseFloat(oneTimeAmount);
      if (!Number.isFinite(amountNum) || amountNum < 0) {
        setError('Amount must be 0 or greater');
        return;
      }
      if (!oneTimeDate) {
        setError('Date is required');
        return;
      }
      payload.amount = amountNum;
      payload.oneTimeDate = new Date(oneTimeDate).toISOString();

      const windowNum = Number.parseInt(paymentWindowDays, 10);
      if (Number.isInteger(windowNum) && windowNum >= 1 && windowNum <= 14) {
        payload.paymentWindowDays = windowNum;
      }
    }

    setSaving(true);
    setError(null);
    try {
      await onSubmit(payload);
    } catch (err) {
      setError('Failed to save');
      setSaving(false);
    }
  };

  const showPaymentDetection = (kind === 'recurring' && scheduled) || kind === 'one_time';

  return (
    <Modal onClose={onClose} size="md" panelClassName="p-6 max-h-[90vh] overflow-y-auto">
      <div className="mb-5 text-lg font-semibold text-slate-100">
        {initial ? 'Edit item' : 'Add item'}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-slate-500">Type</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setKind('recurring')}
              className={`rounded-md border px-3 py-2 text-sm transition-colors ${
                kind === 'recurring'
                  ? 'border-accent-500 bg-accent-500/10 text-accent-300'
                  : 'border-surface-600/60 bg-surface-700 text-slate-300 hover:bg-surface-600'
              }`}
            >
              Recurring
            </button>
            <button
              type="button"
              onClick={() => setKind('one_time')}
              className={`rounded-md border px-3 py-2 text-sm transition-colors ${
                kind === 'one_time'
                  ? 'border-accent-500 bg-accent-500/10 text-accent-300'
                  : 'border-surface-600/60 bg-surface-700 text-slate-300 hover:bg-surface-600'
              }`}
            >
              One-time
            </button>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-slate-500">Name</label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={kind === 'one_time' ? 'e.g. Christmas gifts' : 'e.g. Netflix'}
            className="w-full rounded-md border border-surface-600/60 bg-surface-700 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:ring-2 focus:ring-accent-500"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-slate-500">Category</label>
          <CategoryCombobox
            value={category}
            options={categories}
            onChange={setCategory}
            placeholder="Select a category"
          />
        </div>

        {kind === 'recurring' && (
          <>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-slate-500">
                Frequency
              </label>
              <select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value)}
                className="w-full rounded-md border border-surface-600/60 bg-surface-700 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-accent-500"
              >
                <option value="monthly">Monthly</option>
                <option value="annual">Annual</option>
                <option value="semi-annual">Semi-annual</option>
                <option value="custom">Custom (per month)</option>
              </select>
            </div>

            {frequency !== 'custom' && (
              <div>
                <label className="mb-1 block text-xs uppercase tracking-wide text-slate-500">
                  Amount{frequency === 'semi-annual' ? ' (each)' : ''}
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-md border border-surface-600/60 bg-surface-700 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:ring-2 focus:ring-accent-500"
                />
              </div>
            )}

            {frequency === 'annual' && (
              <div>
                <label className="mb-1 block text-xs uppercase tracking-wide text-slate-500">Month</label>
                <select
                  value={annualMonth}
                  onChange={(e) => setAnnualMonth(Number.parseInt(e.target.value, 10))}
                  className="w-full rounded-md border border-surface-600/60 bg-surface-700 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-accent-500"
                >
                  {SHORT_MONTH_LABELS.map((m, i) => (
                    <option key={m} value={i}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {frequency === 'semi-annual' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-wide text-slate-500">First month</label>
                  <select
                    value={semiMonth1}
                    onChange={(e) => setSemiMonth1(Number.parseInt(e.target.value, 10))}
                    className="w-full rounded-md border border-surface-600/60 bg-surface-700 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-accent-500"
                  >
                    {SHORT_MONTH_LABELS.map((m, i) => (
                      <option key={m} value={i}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-wide text-slate-500">Second month</label>
                  <select
                    value={semiMonth2}
                    onChange={(e) => setSemiMonth2(Number.parseInt(e.target.value, 10))}
                    className="w-full rounded-md border border-surface-600/60 bg-surface-700 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-accent-500"
                  >
                    {SHORT_MONTH_LABELS.map((m, i) => (
                      <option key={m} value={i}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {frequency === 'custom' && (
              <div>
                <label className="mb-1 block text-xs uppercase tracking-wide text-slate-500">
                  Per-month amounts
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {SHORT_MONTH_LABELS.map((m, i) => (
                    <div key={m}>
                      <div className="mb-0.5 text-[10px] uppercase tracking-wide text-slate-500">{m}</div>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                        value={customAmounts[i]}
                        onChange={(e) => {
                          const next = [...customAmounts];
                          next[i] = e.target.value;
                          setCustomAmounts(next);
                        }}
                        placeholder="0"
                        className="w-full rounded-md border border-surface-600/60 bg-surface-700 px-2 py-1.5 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-accent-500"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between rounded-md bg-surface-700/50 px-3 py-2">
              <div>
                <div className="text-sm text-slate-300">Has a due day</div>
                <div className="text-xs text-slate-500">
                  {scheduled
                    ? 'Tracked as a scheduled obligation'
                    : 'Treated as discretionary spend across the month'}
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={scheduled}
                onClick={() => setScheduled(!scheduled)}
                className={`relative h-5 w-9 rounded-full transition-colors ${
                  scheduled ? 'bg-accent-500' : 'bg-surface-600'
                }`}
              >
                <span
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                    scheduled ? 'translate-x-[18px]' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>

            {scheduled && (
              <div>
                <label className="mb-1 block text-xs uppercase tracking-wide text-slate-500">Due day</label>
                <input
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max="31"
                  value={dueDay}
                  onChange={(e) => setDueDay(e.target.value)}
                  placeholder="15"
                  className="w-24 rounded-md border border-surface-600/60 bg-surface-700 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:ring-2 focus:ring-accent-500"
                />
              </div>
            )}
          </>
        )}

        {kind === 'one_time' && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-slate-500">Amount</label>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={oneTimeAmount}
                onChange={(e) => setOneTimeAmount(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-md border border-surface-600/60 bg-surface-700 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:ring-2 focus:ring-accent-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-slate-500">Date</label>
              <input
                type="date"
                value={oneTimeDate}
                onChange={(e) => setOneTimeDate(e.target.value)}
                className="w-full rounded-md border border-surface-600/60 bg-surface-700 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-accent-500"
              />
            </div>
          </div>
        )}

        {showPaymentDetection && (
          <>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-slate-500">
                Match keyword
              </label>
              <input
                value={matchKeyword}
                onChange={(e) => setMatchKeyword(e.target.value)}
                placeholder="e.g. NETFLIX.COM"
                className="w-full rounded-md border border-surface-600/60 bg-surface-700 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:ring-2 focus:ring-accent-500"
              />
              <p className="mt-1 text-xs text-slate-500">
                Used to find matching payments. Defaults to the name if empty.
              </p>
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-slate-500">
                Payment detection window
              </label>
              <input
                type="number"
                inputMode="numeric"
                min="1"
                max="14"
                value={paymentWindowDays}
                onChange={(e) => setPaymentWindowDays(e.target.value)}
                className="w-24 rounded-md border border-surface-600/60 bg-surface-700 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-accent-500"
              />
              <p className="mt-1 text-xs text-slate-500">Days before/after the date to look for a matching payment.</p>
            </div>
          </>
        )}

        <div className="flex items-center justify-between rounded-md bg-surface-700/50 px-3 py-2">
          <div className="text-sm text-slate-300">Active</div>
          <button
            type="button"
            role="switch"
            aria-checked={isActive}
            onClick={() => setIsActive(!isActive)}
            className={`relative h-5 w-9 rounded-full transition-colors ${
              isActive ? 'bg-accent-500' : 'bg-surface-600'
            }`}
          >
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                isActive ? 'translate-x-[18px]' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>

        {error && (
          <div className="rounded-md border border-red-700/50 bg-red-900/40 px-3 py-2 text-xs text-red-200">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-surface-700"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-accent-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? 'Saving…' : initial ? 'Save' : 'Add'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
