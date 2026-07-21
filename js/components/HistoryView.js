(function () {
  const { html, useState, useMemo } = window.Ledger;
  const { formatAmount, formatDate, accountName, groupName } = window.Ledger.utils;

  function HistoryView({ data, onAdd, onUpdate, onDelete }) {
    const [editingId, setEditingId] = useState(null);
    const [showAdd, setShowAdd] = useState(false);

    const sorted = useMemo(
      () => [...data.transactions].sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.id - a.id),
      [data.transactions]
    );

    const editing = editingId != null ? data.transactions.find(t => t.id === editingId) : null;
    const { Modal } = window.Ledger.components;
    const { ExpenseForm } = window.Ledger.components;

    return html`
      <div class="view">
        <div class="view-head">
          <h2 class="view-title">History</h2>
          <button class="accent small" onClick=${() => setShowAdd(true)}>+ Add expense</button>
        </div>
        ${sorted.length === 0 && html`<p class="empty-note">No expenses yet. Tap "+ Add expense" to create your first one.</p>`}
        <div class="expense-list">
          ${sorted.map(t => html`
            <div class="expense-row" onClick=${() => setEditingId(t.id)}>
              <div class="expense-row-main">
                <div class="expense-row-title">${t.title}</div>
                <div class="expense-row-meta">
                  ${formatDate(t.date)} · ${accountName(data.accounts, t.from)} → ${accountName(data.accounts, t.to)}
                  ${t.groupId ? html` · <span class="chip">${groupName(data.groups, t.groupId)}</span>` : ''}
                </div>
              </div>
              <div class="expense-row-amount">${formatAmount(t.amount)}</div>
            </div>
          `)}
        </div>

        ${editing && html`
          <${Modal} title="Edit expense" onClose=${() => setEditingId(null)}>
            <${ExpenseForm}
              accounts=${data.accounts}
              groups=${data.groups}
              initial=${editing}
              onSave=${patch => { onUpdate(editing.id, patch); setEditingId(null); }}
              onCancel=${() => setEditingId(null)}
              onDelete=${() => {
                if (confirm(`Delete "${editing.title}"? This cannot be undone.`)) {
                  onDelete(editing.id);
                  setEditingId(null);
                }
              }}
            />
          <//>
        `}

        ${showAdd && html`
          <${Modal} title="Add expense" onClose=${() => setShowAdd(false)}>
            <${ExpenseForm}
              accounts=${data.accounts}
              groups=${data.groups}
              settings=${data.settings}
              onSave=${tx => { onAdd(tx); setShowAdd(false); }}
              onCancel=${() => setShowAdd(false)}
            />
          <//>
        `}
      </div>
    `;
  }

  window.Ledger.components.HistoryView = HistoryView;
})();
