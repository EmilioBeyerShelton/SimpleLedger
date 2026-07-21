(function () {
  const { html, useState } = window.Ledger;
  const { formatAmount, accountBalance } = window.Ledger.utils;

  function AccountsView({ data, onUpdate }) {
    const [editingId, setEditingId] = useState(null);
    const [showAdd, setShowAdd] = useState(false);

    const { Modal, AccountForm } = window.Ledger.components;
    const defaultId = data.settings ? data.settings.defaultAccountId : null;
    const sorted = [...data.accounts].sort((a, b) => a.id.localeCompare(b.id));
    const editing = editingId != null ? data.accounts.find(a => a.id === editingId) : null;

    function applySave({ title, id, oldId, makeDefault }) {
      onUpdate(d => {
        const nextAccounts = oldId
          ? d.accounts.map(a => a.id === oldId ? { id, title } : a)
          : [...d.accounts, { id, title }];

        const nextTransactions = oldId && oldId !== id
          ? d.transactions.map(t => ({
              ...t,
              from: t.from === oldId ? id : t.from,
              to: t.to === oldId ? id : t.to
            }))
          : d.transactions;

        let nextDefaultId = d.settings ? d.settings.defaultAccountId : null;
        if (makeDefault) {
          nextDefaultId = id;
        } else if (oldId && nextDefaultId === oldId) {
          nextDefaultId = null; // was default, explicitly unchecked
        }

        return {
          ...d,
          accounts: nextAccounts,
          transactions: nextTransactions,
          settings: { ...d.settings, defaultAccountId: nextDefaultId }
        };
      });
    }

    function deleteAccount(id) {
      const inUse = data.transactions.some(t => t.from === id || t.to === id);
      if (inUse) {
        alert('This account is used by one or more expenses — reassign or delete those first.');
        return;
      }
      const acc = data.accounts.find(a => a.id === id);
      if (!confirm(`Delete account "${acc.title}"?`)) return;
      onUpdate(d => ({
        ...d,
        accounts: d.accounts.filter(a => a.id !== id),
        settings: { ...d.settings, defaultAccountId: d.settings && d.settings.defaultAccountId === id ? null : (d.settings ? d.settings.defaultAccountId : null) }
      }));
      setEditingId(null);
    }

    return html`
      <div class="view">
        <div class="view-head">
          <h2 class="view-title">Accounts</h2>
          <button class="accent small" onClick=${() => setShowAdd(true)}>+ Add account</button>
        </div>
        <p class="view-sub">
          Money always moves from one account to another — accounts are also categories.
          The path (e.g. <code>expenses.groceries.edeka</code>) is what you filter and pick
          against when adding an expense; the title is just what's shown.
        </p>

        <div class="account-list">
          ${sorted.length === 0 && html`<p class="empty-note">No accounts yet.</p>`}
          ${sorted.map(a => {
            const bal = accountBalance(a.id, data.transactions);
            const isDefault = a.id === defaultId;
            return html`
              <div class="account-row" onClick=${() => setEditingId(a.id)}>
                <span class="default-star ${isDefault ? 'active' : ''}" title=${isDefault ? 'Default account' : ''}>
                  ${isDefault ? '★' : ''}
                </span>
                <div class="account-row-fields">
                  <div class="account-title">${a.title}</div>
                  <div class="account-id">${a.id}</div>
                </div>
                <span class="account-balance ${bal < 0 ? 'negative' : ''}">${formatAmount(bal)}</span>
              </div>
            `;
          })}
        </div>

        ${editing && html`
          <${Modal} title="Edit account" onClose=${() => setEditingId(null)}>
            <${AccountForm}
              accounts=${data.accounts}
              initial=${editing}
              isDefault=${editing.id === defaultId}
              onSave=${patch => { applySave(patch); setEditingId(null); }}
              onCancel=${() => setEditingId(null)}
              onDelete=${() => deleteAccount(editing.id)}
            />
          <//>
        `}

        ${showAdd && html`
          <${Modal} title="Add account" onClose=${() => setShowAdd(false)}>
            <${AccountForm}
              accounts=${data.accounts}
              isDefault=${false}
              onSave=${patch => { applySave(patch); setShowAdd(false); }}
              onCancel=${() => setShowAdd(false)}
            />
          <//>
        `}
      </div>
    `;
  }

  window.Ledger.components.AccountsView = AccountsView;
})();
