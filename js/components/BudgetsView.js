(function () {
  const { html, useState } = window.Ledger;
  const { formatAmount, formatDate, groupMemberTotals, groupSpent, groupTransactionList, nextId } = window.Ledger.utils;

  function BudgetsView({ data, onUpdate }) {
    const [showNew, setShowNew] = useState(false);
    const [name, setName] = useState('');
    const [membersText, setMembersText] = useState('');
    const [budgetAmount, setBudgetAmount] = useState('');
    const [expandedId, setExpandedId] = useState(null);

    function createGroup(e) {
      e.preventDefault();
      const trimmedName = name.trim();
      const members = membersText.split(',').map(m => m.trim()).filter(Boolean);
      if (!trimmedName) return;
      if (members.length === 0) { alert('Add at least one member (comma separated).'); return; }
      const budget = budgetAmount.trim() && !Number.isNaN(Number(budgetAmount)) ? Number(budgetAmount) : null;
      onUpdate(d => ({
        ...d,
        groups: [...d.groups, { id: nextId(d.groups), name: trimmedName, members, budget }]
      }));
      setName('');
      setMembersText('');
      setBudgetAmount('');
      setShowNew(false);
    }

    function updateBudget(id, raw) {
      const budget = raw.trim() && !Number.isNaN(Number(raw)) ? Number(raw) : null;
      onUpdate(d => ({
        ...d,
        groups: d.groups.map(g => g.id === id ? { ...g, budget } : g)
      }));
    }

    function deleteGroup(id) {
      const usageCount = data.groupTransactions.filter(gt => gt.groupId === id).length;
      const msg = usageCount > 0
        ? `Delete this budget? It's linked to ${usageCount} expense(s) — those expenses stay, only the link is removed.`
        : 'Delete this budget?';
      if (!confirm(msg)) return;
      onUpdate(d => ({
        ...d,
        groups: d.groups.filter(g => g.id !== id),
        groupTransactions: d.groupTransactions.filter(gt => gt.groupId !== id)
      }));
    }

    return html`
      <div class="view">
        <h2 class="view-title">Budgets</h2>
        <p class="view-sub">A budget groups people and expenses together — give it a cap to track depletion, or leave it open just to keep a shared tab. Linking an expense to a budget is informational: it doesn't move any extra money.</p>

        ${data.groups.length === 0 && !showNew && html`<p class="empty-note">No budgets yet.</p>`}

        ${data.groups.map(g => {
          const totals = groupMemberTotals(g, data.groupTransactions);
          const spent = groupSpent(g.id, data.groupTransactions, data.transactions);
          const groupTx = groupTransactionList(g.id, data.groupTransactions, data.transactions);
          const expanded = expandedId === g.id;
          const hasBudget = g.budget != null;
          const pct = hasBudget && g.budget > 0 ? Math.min(100, (spent / g.budget) * 100) : 0;
          const overBudget = hasBudget && spent > g.budget;

          return html`
            <div class="group-card">
              <div class="group-card-head" onClick=${() => setExpandedId(expanded ? null : g.id)}>
                <div>
                  <div class="group-card-title">${g.name}</div>
                  <div class="group-card-sub">${g.members.join(', ')}</div>
                </div>
                <button class="ghost small" title="Delete budget" onClick=${e => { e.stopPropagation(); deleteGroup(g.id); }}>✕</button>
              </div>

              <div class="group-spent-row">
                <span>Total spent</span>
                <span class="group-spent-amount">${formatAmount(spent)}</span>
              </div>

              ${hasBudget ? html`
                <div class="budget-bar-wrap">
                  <div class="budget-bar-track">
                    <div class="budget-bar-fill ${overBudget ? 'over' : ''}" style=${`width:${pct}%`}></div>
                  </div>
                  <div class="budget-bar-label ${overBudget ? 'over' : ''}">
                    ${overBudget
                      ? html`${formatAmount(spent - g.budget)} over ${formatAmount(g.budget)} budget`
                      : html`${formatAmount(g.budget - spent)} left of ${formatAmount(g.budget)}`}
                  </div>
                </div>
              ` : html`
                <div class="budget-none-row" onClick=${e => e.stopPropagation()}>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    class="budget-inline-input"
                    placeholder="Set a budget…"
                    onBlur=${e => updateBudget(g.id, e.target.value)}
                    onKeyDown=${e => { if (e.key === 'Enter') e.target.blur(); }}
                  />
                </div>
              `}

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
                  ${hasBudget && html`
                    <label class="checkbox-row">
                      <input
                        type="checkbox"
                        checked
                        onChange=${() => updateBudget(g.id, '')}
                      />
                      Has a budget — uncheck to remove it
                    </label>
                  `}
                  ${groupTx.length === 0 && html`<p class="empty-note">No expenses linked to this budget yet.</p>`}
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
            <input type="text" placeholder="Budget name (e.g. Roommates)" value=${name} onInput=${e => setName(e.target.value)} />
            <input type="text" placeholder="Members, comma separated (e.g. Alex, Sam, Jo)" value=${membersText} onInput=${e => setMembersText(e.target.value)} />
            <input type="number" step="0.01" min="0" placeholder="Budget amount (optional)" value=${budgetAmount} onInput=${e => setBudgetAmount(e.target.value)} />
            <div class="form-actions-right">
              <button type="button" onClick=${() => setShowNew(false)}>Cancel</button>
              <button type="submit" class="primary">Create budget</button>
            </div>
          </form>
        ` : html`
          <button class="accent small" onClick=${() => setShowNew(true)}>+ New budget</button>
        `}
      </div>
    `;
  }

  window.Ledger.components.BudgetsView = BudgetsView;
})();