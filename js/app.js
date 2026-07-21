(function () {
  const { html, render, useState } = window.Ledger;
  const { nextId } = window.Ledger.utils;
  const { TopBar, BottomNav, HistoryView, AccountsView, GroupsView, SettingsView, ReportView } = window.Ledger.components;

  function App() {
    const store = window.Ledger.useStore();
    const [tab, setTab] = useState('history');
    const [toast, setToast] = useState('');

    function flash(msg) {
      setToast(msg);
      setTimeout(() => setToast(t => (t === msg ? '' : t)), 1800);
    }

    if (!store.data) {
      return html`<div class="loading-screen">Loading…</div>`;
    }

    function addTransaction(tx) {
      store.update(d => ({
        ...d,
        transactions: [...d.transactions, { ...tx, id: nextId(d.transactions) }]
      }));
      flash('Expense added.');
    }

    function updateTransaction(id, patch) {
      store.update(d => ({
        ...d,
        transactions: d.transactions.map(t => t.id === id ? { ...t, ...patch } : t)
      }));
      flash('Expense updated.');
    }

    function deleteTransaction(id) {
      store.update(d => ({ ...d, transactions: d.transactions.filter(t => t.id !== id) }));
      flash('Expense deleted.');
    }

    return html`
      <div class="app-shell">
        <${TopBar} fileStatus=${store.fileStatus} />

        <main class="main-content">
          ${tab === 'history' && html`
            <${HistoryView}
              data=${store.data}
              onAdd=${addTransaction}
              onUpdate=${updateTransaction}
              onDelete=${deleteTransaction}
            />
          `}
          ${tab === 'report' && html`
            <${ReportView} data=${store.data} />
          `}
          ${tab === 'accounts' && html`
            <${AccountsView} data=${store.data} onUpdate=${store.update} />
          `}
          ${tab === 'groups' && html`
            <${GroupsView} data=${store.data} onUpdate=${store.update} />
          `}
          ${tab === 'settings' && html`
            <${SettingsView} store=${store} />
          `}
        </main>

        ${toast && html`<div class="toast">${toast}</div>`}

        <${BottomNav} active=${tab} onChange=${setTab} />
      </div>
    `;
  }

  render(html`<${App} />`, document.getElementById('app'));
})();
