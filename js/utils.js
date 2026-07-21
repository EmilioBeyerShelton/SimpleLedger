(function () {
  // ---------- ids ----------
  function nextId(list) {
    return list.reduce((max, x) => Math.max(max, Number(x.id) || 0), 0) + 1;
  }

  // ---------- formatting ----------
  function todayStr() {
    const d = new Date();
    const tzOffset = d.getTimezoneOffset() * 60000;
    return new Date(d - tzOffset).toISOString().slice(0, 10);
  }

  function formatAmount(amount) {
    const n = Number(amount) || 0;
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatDate(str) {
    if (!str) return '';
    const d = new Date(str + 'T00:00:00');
    if (isNaN(d)) return str;
    return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
  }

  // ---------- ledger math ----------
  // Simple double-entry balance: every transaction moves `amount` out of
  // `from` and into `to`. An account's balance is the sum of everything
  // that flowed in, minus everything that flowed out.
  function accountBalance(accountId, transactions) {
    let bal = 0;
    for (const t of transactions) {
      if (t.to === accountId) bal += t.amount;
      if (t.from === accountId) bal -= t.amount;
    }
    return bal;
  }

  function accountName(accounts, id) {
    const a = accounts.find(a => a.id === id);
    return a ? a.title : (id || '—');
  }

  // Cleans up user-typed account paths: lowercase, dots stay as hierarchy
  // separators, whitespace becomes underscores, anything else disallowed
  // is stripped. "Expenses > Groceries" -> "expenses_greater_groceries"
  // isn't attempted — we just strip stray symbols and let the person type
  // dots themselves, e.g. "expenses.groceries.edeka".
  function normalizeAccountId(raw) {
    return String(raw || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9._-]/g, '');
  }

  function groupName(groups, id) {
    const g = groups.find(g => g.id === id);
    return g ? g.name : '';
  }

  // Splits an amount evenly across members down to the cent, handing any
  // leftover pennies to the first members so the total always matches exactly.
  function splitEqually(amount, members) {
    if (!members.length) return [];
    const cents = Math.round(Number(amount) * 100) || 0;
    const base = Math.floor(cents / members.length);
    const remainder = cents - base * members.length;
    return members.map((m, i) => ({
      member: m,
      amount: (base + (i < remainder ? 1 : 0)) / 100
    }));
  }

  // Per-member totals of what they've been assigned across every expense
  // split within a group — i.e. what each person owes back for shared costs.
  function groupMemberTotals(group, transactions) {
    const totals = {};
    group.members.forEach(m => { totals[m] = 0; });
    transactions
      .filter(t => t.groupId === group.id && Array.isArray(t.splits))
      .forEach(t => {
        t.splits.forEach(s => {
          totals[s.member] = (totals[s.member] || 0) + s.amount;
        });
      });
    return totals;
  }

  // ---------- date grouping ----------
  const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  function dateBucket(dateStr, today) {
    if (!dateStr) return '';
    const now = today || new Date();
    const d = new Date(dateStr + 'T00:00:00');
    const t = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diffDays = Math.round((t - d) / 86400000);

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';

    const dow = t.getDay(); // 0 = Sunday
    const daysSinceMonday = (dow + 6) % 7;
    const startOfWeek = new Date(t);
    startOfWeek.setDate(t.getDate() - daysSinceMonday);

    if (d >= startOfWeek) return 'This week';

    const label = MONTH_NAMES[d.getMonth()];
    return d.getFullYear() === t.getFullYear() ? label : `${label} ${d.getFullYear()}`;
  }

  function formatDayLabel(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d)) return dateStr;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  window.Ledger.utils = {
    nextId, todayStr, formatAmount, formatDate,
    accountBalance, accountName, groupName,
    splitEqually, groupMemberTotals, normalizeAccountId,
    dateBucket, formatDayLabel
  };
})();