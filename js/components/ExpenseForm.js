(function () {
  const { html, useState, useEffect } = window.Ledger;
  const { todayStr, splitEqually } = window.Ledger.utils;
  const { AccountPicker } = window.Ledger.components;

  const FALLBACK_FROM_ID = 'assets.bank_accounts.checkings';
  const FALLBACK_TO_ID = 'expenses';

  function defaultAccountId(accounts, preferredId, fallbackIndex) {
    if (accounts.some(a => a.id === preferredId)) return preferredId;
    return accounts[fallbackIndex] ? accounts[fallbackIndex].id : (accounts[0] ? accounts[0].id : null);
  }

  // Shared by the "Add" tab (blank form) and the history list's edit modal.
  function ExpenseForm({ accounts, groups, settings, initial, onSave, onCancel, onDelete }) {
    const isEdit = !!initial;
    const preferredFromId = (settings && settings.defaultAccountId) || FALLBACK_FROM_ID;

    const [title, setTitle] = useState(initial ? initial.title : '');
    const [amount, setAmount] = useState(initial ? String(initial.amount) : '');
    const [date, setDate] = useState(initial ? initial.date : todayStr());
    const [from, setFrom] = useState(initial ? initial.from : defaultAccountId(accounts, preferredFromId, 0));
    const [to, setTo] = useState(initial ? initial.to : defaultAccountId(accounts, FALLBACK_TO_ID, accounts.length > 1 ? 1 : 0));
    const [groupId, setGroupId] = useState(initial && initial.groupId ? initial.groupId : '');
    const [splitRows, setSplitRows] = useState([]); // [{member, included, amount}]
    const [showMore, setShowMore] = useState(isEdit);
    const [error, setError] = useState('');

    // Seed split rows whenever the chosen group changes (or on first load in edit mode).
    useEffect(() => {
      if (!groupId) { setSplitRows([]); return; }
      const group = groups.find(g => g.id === Number(groupId));
      if (!group) { setSplitRows([]); return; }

      const existing = isEdit && initial.groupId === Number(groupId) && Array.isArray(initial.splits)
        ? initial.splits
        : null;

      if (existing) {
        const includedMembers = new Set(existing.map(s => s.member));
        setSplitRows(group.members.map(m => ({
          member: m,
          included: includedMembers.has(m),
          amount: (existing.find(s => s.member === m) || { amount: 0 }).amount
        })));
      } else {
        const shares = splitEqually(Number(amount) || 0, group.members);
        setSplitRows(shares.map(s => ({ member: s.member, included: true, amount: s.amount })));
      }
      // eslint-disable-next-line
    }, [groupId, groups]);

    function toggleMember(member) {
      const next = splitRows.map(r => r.member === member ? { ...r, included: !r.included } : r);
      const includedMembers = next.filter(r => r.included).map(r => r.member);
      const shares = splitEqually(Number(amount) || 0, includedMembers);
      const shareMap = Object.fromEntries(shares.map(s => [s.member, s.amount]));
      setSplitRows(next.map(r => r.included ? { ...r, amount: shareMap[r.member] ?? 0 } : r));
    }

    function setMemberAmount(member, val) {
      setSplitRows(rows => rows.map(r => r.member === member ? { ...r, amount: val } : r));
    }

    function rebalanceEqually() {
      const includedMembers = splitRows.filter(r => r.included).map(r => r.member);
      const shares = splitEqually(Number(amount) || 0, includedMembers);
      const shareMap = Object.fromEntries(shares.map(s => [s.member, s.amount]));
      setSplitRows(rows => rows.map(r => r.included ? { ...r, amount: shareMap[r.member] ?? 0 } : r));
    }

    function handleSubmit(e) {
      e.preventDefault();
      setError('');

      const trimmedTitle = title.trim();
      const amountNum = Number(amount);
      if (!trimmedTitle) { setError('Title is required.'); return; }
      if (!amount || Number.isNaN(amountNum) || amountNum <= 0) { setError('Enter an amount greater than 0.'); return; }
      if (from === to) { setError('"From" and "to" accounts must be different.'); return; }

      let splits = null;
      if (groupId) {
        const included = splitRows.filter(r => r.included);
        if (!included.length) { setError('Select at least one member to split with.'); return; }
        splits = included.map(r => ({ member: r.member, amount: Number(r.amount) || 0 }));
        const sum = splits.reduce((s, r) => s + r.amount, 0);
        if (Math.abs(sum - amountNum) > 0.01) {
          setError(`Splits add up to ${sum.toFixed(2)}, but the expense is ${amountNum.toFixed(2)}. Adjust the amounts so they match.`);
          return;
        }
      }

      onSave({
        title: trimmedTitle,
        amount: amountNum,
        date: date || todayStr(),
        from,
        to,
        groupId: groupId ? Number(groupId) : null,
        splits
      });

      if (!isEdit) {
        setTitle('');
        setAmount('');
        setGroupId('');
        setSplitRows([]);
      }
    }

    const selectedGroup = groupId ? groups.find(g => g.id === Number(groupId)) : null;

    return html`
      <form class="expense-form" onSubmit=${handleSubmit}>
        <div class="form-row">
          <label for="f-title">Title</label>
          <input
            id="f-title"
            type="text"
            placeholder="e.g. Groceries"
            value=${title}
            onInput=${e => setTitle(e.target.value)}
          />
        </div>

        <div class="form-row">
          <label for="f-amount">Amount</label>
          <input
            id="f-amount"
            type="number"
            step="0.01"
            min="0"
            inputmode="decimal"
            placeholder="0.00"
            value=${amount}
            onInput=${e => setAmount(e.target.value)}
          />
        </div>

        <button type="button" class="ghost small more-toggle" onClick=${() => setShowMore(s => !s)}>
          ${showMore ? '– Fewer options' : '+ Date, accounts, split with a budget'}
        </button>

        ${showMore && html`
          <div class="more-options">
            <div class="two-col">
              <div class="form-row">
                <label for="f-date">Date</label>
                <input id="f-date" type="date" value=${date} onInput=${e => setDate(e.target.value)} />
              </div>
              <div class="form-row">
                <label for="f-group">Split with budget</label>
                <select id="f-group" value=${groupId} onChange=${e => setGroupId(e.target.value)}>
                  <option value="">No split</option>
                  ${groups.map(g => html`<option value=${g.id}>${g.name}</option>`)}
                </select>
              </div>
            </div>

            <div class="two-col">
              <div class="form-row">
                <label for="f-from">From account</label>
                <${AccountPicker}
                  inputId="f-from"
                  accounts=${accounts}
                  value=${from}
                  onChange=${setFrom}
                  placeholder="Type or pick an account"
                />
              </div>
              <div class="form-row">
                <label for="f-to">To account</label>
                <${AccountPicker}
                  inputId="f-to"
                  accounts=${accounts}
                  value=${to}
                  onChange=${setTo}
                  placeholder="Type or pick an account"
                />
              </div>
            </div>

            ${selectedGroup && html`
              <div class="split-box">
                <div class="split-box-head">
                  <span>Split among ${selectedGroup.name}</span>
                  <button type="button" class="ghost small" onClick=${rebalanceEqually}>Split equally</button>
                </div>
                ${splitRows.map(row => html`
                  <div class="split-row ${row.included ? '' : 'excluded'}">
                    <label class="split-member">
                      <input
                        type="checkbox"
                        checked=${row.included}
                        onChange=${() => toggleMember(row.member)}
                      />
                      ${row.member}
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      class="split-amount"
                      disabled=${!row.included}
                      value=${row.amount}
                      onInput=${e => setMemberAmount(row.member, e.target.value)}
                    />
                  </div>
                `)}
              </div>
            `}
          </div>
        `}

        ${error && html`<div class="form-error">${error}</div>`}

        <div class="form-actions">
          ${isEdit && html`<button type="button" class="danger" onClick=${onDelete}>Delete</button>`}
          <span class="form-actions-right">
            ${onCancel && html`<button type="button" onClick=${onCancel}>Cancel</button>`}
            <button type="submit" class="primary">${isEdit ? 'Save changes' : 'Add expense'}</button>
          </span>
        </div>
      </form>
    `;
  }

  window.Ledger.components.ExpenseForm = ExpenseForm;
})();