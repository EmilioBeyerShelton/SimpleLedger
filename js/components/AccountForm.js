(function () {
  const { html, useState } = window.Ledger;
  const { normalizeAccountId } = window.Ledger.utils;

  // Shared by the "+ Add account" and the accounts list's edit modal.
  function AccountForm({ accounts, initial, isDefault, onSave, onCancel, onDelete }) {
    const isEdit = !!initial;

    const [title, setTitle] = useState(initial ? initial.title : '');
    const [idText, setIdText] = useState(initial ? initial.id : '');
    const [makeDefault, setMakeDefault] = useState(!!isDefault);
    const [error, setError] = useState('');

    function handleSubmit(e) {
      e.preventDefault();
      setError('');

      const trimmedTitle = title.trim();
      const id = normalizeAccountId(idText);
      if (!trimmedTitle) { setError('Title is required.'); return; }
      if (!id) { setError('Give the account a path, e.g. expenses.groceries.edeka'); return; }

      const clash = accounts.find(a => a.id === id && (!isEdit || a.id !== initial.id));
      if (clash) { setError(`An account with the path "${id}" already exists.`); return; }

      onSave({
        title: trimmedTitle,
        id,
        oldId: isEdit ? initial.id : null,
        makeDefault
      });
    }

    return html`
      <form class="expense-form" onSubmit=${handleSubmit}>
        <div class="form-row">
          <label for="a-title">Title</label>
          <input
            id="a-title"
            type="text"
            placeholder="e.g. EDEKA"
            value=${title}
            onInput=${e => setTitle(e.target.value)}
          />
        </div>

        <div class="form-row">
          <label for="a-id">Path</label>
          <input
            id="a-id"
            type="text"
            placeholder="e.g. expenses.groceries.edeka"
            value=${idText}
            onInput=${e => setIdText(e.target.value)}
          />
        </div>

        <label class="checkbox-row">
          <input type="checkbox" checked=${makeDefault} onChange=${e => setMakeDefault(e.target.checked)} />
          Default account (used as "From" on new expenses)
        </label>

        ${error && html`<div class="form-error">${error}</div>`}

        <div class="form-actions">
          ${isEdit && html`<button type="button" class="danger" onClick=${onDelete}>Delete</button>`}
          <span class="form-actions-right">
            <button type="button" onClick=${onCancel}>Cancel</button>
            <button type="submit" class="primary">${isEdit ? 'Save changes' : 'Add account'}</button>
          </span>
        </div>
      </form>
    `;
  }

  window.Ledger.components.AccountForm = AccountForm;
})();
