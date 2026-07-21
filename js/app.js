(function () {
  const { html, render, useState } = window.Ledger;
  const { nextId } = window.Ledger.utils;
  const { TopBar, BottomNav, HistoryView, AccountsView, BudgetsView, SettingsView, ReportView } = window.Ledger.components;

  function App() {
    const store = window.Ledger.useStore();
    const [tab, setTab] = useState('transactions');
    const [toast, setToast] = useState('');

    function flash(msg) {
      setToast(msg);
      setTimeout(() => setToast(t => (t === msg ? '' : t)), 1800);
    }

    if (!store.data) {
      return html`<div class="loading-screen">Loading…</div>`;
    }

    function addTransaction(payload) {
      const { groupId, splits, ...txFields } = payload;
      store.update(d => {
        const newId = nextId(d.transactions);
        const transactions = [...d.transactions, { ...txFields, id: newId }];
        const groupTransactions = groupId
          ? [...d.groupTransactions, { id: nextId(d.groupTransactions), groupId, transactionId: newId, splits: splits || [] }]
          : d.groupTransactions;
        return { ...d, transactions, groupTransactions };
      });
      flash('Expense added.');
    }

    function updateTransaction(id, payload) {
      const { groupId, splits, ...txFields } = payload;
      store.update(d => {
        const transactions = d.transactions.map(t => t.id === id ? { ...t, ...txFields } : t);
        const remaining = d.groupTransactions.filter(gt => gt.transactionId !== id);
        const groupTransactions = groupId
          ? [...remaining, { id: nextId(remaining), groupId, transactionId: id, splits: splits || [] }]
          : remaining;
        return { ...d, transactions, groupTransactions };
      });
      flash('Expense updated.');
    }

    function deleteTransaction(id) {
      store.update(d => ({
        ...d,
        transactions: d.transactions.filter(t => t.id !== id),
        groupTransactions: d.groupTransactions.filter(gt => gt.transactionId !== id)
      }));
      flash('Expense deleted.');
    }

    return html`
      <div class="app-shell">
        <${TopBar} fileStatus=${store.fileStatus} />

        <main class="main-content">
          ${tab === 'transactions' && html`
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
          ${tab === 'budgets' && html`
            <${BudgetsView} data=${store.data} onUpdate=${store.update} />
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