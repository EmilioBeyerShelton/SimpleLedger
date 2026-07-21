(function () {
  const { html, useState } = window.Ledger;
  const { formatAmount, formatDate, groupMemberTotals, nextId } = window.Ledger.utils;

  function GroupsView({ data, onUpdate }) {
    const [showNew, setShowNew] = useState(false);
    const [name, setName] = useState('');
    const [membersText, setMembersText] = useState('');
    const [expandedId, setExpandedId] = useState(null);

    function createGroup(e) {
      e.preventDefault();
      const trimmedName = name.trim();
      const members = membersText.split(',').map(m => m.trim()).filter(Boolean);
      if (!trimmedName) return;
      if (members.length === 0) { alert('Add at least one member (comma separated).'); return; }
      onUpdate(d => ({
        ...d,
        groups: [...d.groups, { id: nextId(d.groups), name: trimmedName, members }]
      }));
      setName('');
      setMembersText('');
      setShowNew(false);
    }

    function deleteGroup(id) {
      const usageCount = data.transactions.filter(t => t.groupId === id).length;
      const msg = usageCount > 0
        ? `Delete this group? ${usageCount} expense(s) reference it — their split will be cleared, but the expenses stay.`
        : 'Delete this group?';
      if (!confirm(msg)) return;
      onUpdate(d => ({
        ...d,
        groups: d.groups.filter(g => g.id !== id),
        transactions: d.transactions.map(t => t.groupId === id ? { ...t, groupId: null, splits: null } : t)
      }));
    }

    return html`
      <div class="view">
        <h2 class="view-title">Groups</h2>
        <p class="view-sub">Create a group to split expenses with other people. Splitting only tracks who owes what — it doesn't move any extra money.</p>

        ${data.groups.length === 0 && !showNew && html`<p class="empty-note">No groups yet.</p>`}

        ${data.groups.map(g => {
          const totals = groupMemberTotals(g, data.transactions);
          const groupTx = data.transactions
            .filter(t => t.groupId === g.id)
            .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
          const expanded = expandedId === g.id;
          return html`
            <div class="group-card">
              <div class="group-card-head" onClick=${() => setExpandedId(expanded ? null : g.id)}>
                <div>
                  <div class="group-card-title">${g.name}</div>
                  <div class="group-card-sub">${g.members.join(', ')}</div>
                </div>
                <button class="ghost small" title="Delete group" onClick=${e => { e.stopPropagation(); deleteGroup(g.id); }}>✕</button>
              </div>
              <div class="group-totals">
                ${g.members.map(m => html`
                  <div class="group-total-row">
                    <span>${m}</span>
                    <span>${formatAmount(totals[m] || 0)}</span>
                  </div>
                `)}
              </div>
              ${expanded && html`
                <div class="group-expenses">
                  ${groupTx.length === 0 && html`<p class="empty-note">No expenses split with this group yet.</p>`}
                  ${groupTx.map(t => html`
                    <div class="group-expense-row">
                      <span>${formatDate(t.date)} · ${t.title}</span>
                      <span>${formatAmount(t.amount)}</span>
                    </div>
                  `)}
                </div>
              `}
            </div>
          `;
        })}

        ${showNew ? html`
          <form class="inline-add-form column" onSubmit=${createGroup}>
            <input type="text" placeholder="Group name (e.g. Roommates)" value=${name} onInput=${e => setName(e.target.value)} />
            <input type="text" placeholder="Members, comma separated (e.g. Alex, Sam, Jo)" value=${membersText} onInput=${e => setMembersText(e.target.value)} />
            <div class="form-actions-right">
              <button type="button" onClick=${() => setShowNew(false)}>Cancel</button>
              <button type="submit" class="primary">Create group</button>
            </div>
          </form>
        ` : html`
          <button class="accent small" onClick=${() => setShowNew(true)}>+ New group</button>
        `}
      </div>
    `;
  }

  window.Ledger.components.GroupsView = GroupsView;
})();
