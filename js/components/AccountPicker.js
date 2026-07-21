(function () {
  const { html, useState, useEffect } = window.Ledger;

  // A text input that doubles as a select: typing filters the account
  // list by title OR by id path (so "expenses.groceries" and "EDEKA" both
  // narrow things down), clicking a result selects it, and blurring with
  // an exact title/path match auto-selects too. Blurring with no match
  // reverts to whatever was selected before.
  function AccountPicker({ accounts, value, onChange, placeholder, inputId }) {
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);

    useEffect(() => {
      const acc = accounts.find(a => a.id === value);
      setQuery(acc ? acc.title : '');
      // eslint-disable-next-line
    }, [value, accounts]);

    const q = query.trim().toLowerCase();
    const filtered = q
      ? accounts.filter(a => a.id.toLowerCase().includes(q) || a.title.toLowerCase().includes(q))
      : accounts;

    function selectAccount(a) {
      onChange(a.id);
      setQuery(a.title);
      setOpen(false);
    }

    function handleBlur() {
      // Delay so a click on a dropdown option (which also blurs the
      // input) has a chance to register first.
      setTimeout(() => {
        const typed = query.trim().toLowerCase();
        const exact = accounts.find(
          a => a.id.toLowerCase() === typed || a.title.toLowerCase() === typed
        );
        if (exact) {
          onChange(exact.id);
          setQuery(exact.title);
        } else {
          const current = accounts.find(a => a.id === value);
          setQuery(current ? current.title : '');
        }
        setOpen(false);
      }, 120);
    }

    return html`
      <div class="account-picker">
        <input
          type="text"
          id=${inputId}
          placeholder=${placeholder}
          value=${query}
          autocomplete="off"
          onFocus=${() => setOpen(true)}
          onInput=${e => { setQuery(e.target.value); setOpen(true); }}
          onBlur=${handleBlur}
        />
        ${open && html`
          <div class="account-picker-list">
            ${filtered.length === 0 && html`
              <div class="account-picker-empty">No matching accounts</div>
            `}
            ${filtered.slice(0, 40).map(a => html`
              <div
                class="account-picker-option ${a.id === value ? 'selected' : ''}"
                onMouseDown=${e => { e.preventDefault(); selectAccount(a); }}
              >
                <span class="account-picker-title">${a.title}</span>
                <span class="account-picker-id">${a.id}</span>
              </div>
            `)}
          </div>
        `}
      </div>
    `;
  }

  window.Ledger.components.AccountPicker = AccountPicker;
})();
