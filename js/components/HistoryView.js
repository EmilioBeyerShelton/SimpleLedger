(function () {
  const { html, useState, useMemo } = window.Ledger;
  const { formatAmount, formatDate, accountName, groupName, dateBucket } = window.Ledger.utils;

  function HistoryView({ data, onAdd, onUpdate, onDelete }) {
    const [editingId, setEditingId] = useState(null);
    const [showAdd, setShowAdd] = useState(false);
    const [showFilter, setShowFilter] = useState(false);

    const [searchQuery, setSearchQuery] = useState('');
    const [sortOrder, setSortOrder] = useState('desc'); // 'desc' = newest first
    const [filterFrom, setFilterFrom] = useState('');
    const [filterTo, setFilterTo] = useState('');
    const [filterDateFrom, setFilterDateFrom] = useState('');
    const [filterDateTo, setFilterDateTo] = useState('');
    const [filterGroupId, setFilterGroupId] = useState('');

    const { Modal, ExpenseForm, AccountPicker } = window.Ledger.components;

    const sorted = useMemo(() => {
      const dir = sortOrder === 'asc' ? 1 : -1;
      return [...data.transactions].sort((a, b) =>
        dir * (a.date || '').localeCompare(b.date || '') || dir * (a.id - b.id)
      );
    }, [data.transactions, sortOrder]);

    const filtered = useMemo(() => {
      const q = searchQuery.trim().toLowerCase();
      return sorted.filter(t => {
        if (filterFrom && t.from !== filterFrom) return false;
        if (filterTo && t.to !== filterTo) return false;
        if (filterDateFrom && t.date < filterDateFrom) return false;
        if (filterDateTo && t.date > filterDateTo) return false;
        if (filterGroupId && t.groupId !== Number(filterGroupId)) return false;
        if (q) {
          const fromName = accountName(data.accounts, t.from).toLowerCase();
          const toName = accountName(data.accounts, t.to).toLowerCase();
          const matches = t.title.toLowerCase().includes(q)
            || String(t.from).toLowerCase().includes(q)
            || String(t.to).toLowerCase().includes(q)
            || fromName.includes(q)
            || toName.includes(q);
          if (!matches) return false;
        }
        return true;
      });
    }, [sorted, searchQuery, filterFrom, filterTo, filterDateFrom, filterDateTo, filterGroupId, data.accounts]);

    // Group consecutive same-bucket rows under a divider ("Today",
    // "Yesterday", "This week", or a written-out month). Relies on the
    // list already being date-sorted, so same-bucket rows are contiguous.
    const rows = useMemo(() => {
      const today = new Date();
      const out = [];
      let lastBucket = null;
      filtered.forEach(t => {
        const bucket = dateBucket(t.date, today);
        if (bucket !== lastBucket) {
          out.push({ type: 'divider', label: bucket, key: `divider-${bucket}-${t.id}` });
          lastBucket = bucket;
        }
        out.push({ type: 'tx', tx: t, key: t.id });
      });
      return out;
    }, [filtered]);

    const activeFilterCount = [filterFrom, filterTo, filterDateFrom, filterDateTo, filterGroupId].filter(Boolean).length;

    function clearFilters() {
      setFilterFrom('');
      setFilterTo('');
      setFilterDateFrom('');
      setFilterDateTo('');
      setFilterGroupId('');
    }

    const editing = editingId != null ? data.transactions.find(t => t.id === editingId) : null;

    return html`
      <div class="view">
        <div class="view-head">
          <h2 class="view-title">Transactions</h2>
          <button class="accent small" onClick=${() => setShowAdd(true)}>+ Add expense</button>
        </div>

        <div class="search-filter-row">
          <input
            type="text"
            class="search-input"
            placeholder="Search title, from, or to…"
            value=${searchQuery}
            onInput=${e => setSearchQuery(e.target.value)}
          />
          <button
            class="icon-btn ${activeFilterCount > 0 ? 'active' : ''}"
            title="Filter expenses"
            onClick=${() => setShowFilter(true)}
          >
            ⚗
            ${activeFilterCount > 0 && html`<span class="filter-badge">${activeFilterCount}</span>`}
          </button>
        </div>

        ${data.transactions.length === 0 && html`<p class="empty-note">No expenses yet. Tap "+ Add expense" to create your first one.</p>`}
        ${data.transactions.length > 0 && filtered.length === 0 && html`<p class="empty-note">No expenses match your search or filters.</p>`}

        <div class="expense-list">
          ${rows.map(row => row.type === 'divider'
            ? html`<div class="date-divider" key=${row.key}><span>${row.label}</span></div>`
            : html`
              <div class="expense-row" key=${row.key} onClick=${() => setEditingId(row.tx.id)}>
                <div class="expense-row-main">
                  <div class="expense-row-title">${row.tx.title}</div>
                  <div class="expense-row-meta">
                    ${formatDate(row.tx.date)} · ${accountName(data.accounts, row.tx.from)} → ${accountName(data.accounts, row.tx.to)}
                    ${row.tx.groupId ? html` · <span class="chip">${groupName(data.groups, row.tx.groupId)}</span>` : ''}
                  </div>
                </div>
                <div class="expense-row-amount">${formatAmount(row.tx.amount)}</div>
              </div>
            `
          )}
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

        ${showFilter && html`
          <${Modal} title="Filter expenses" onClose=${() => setShowFilter(false)}>
            <div class="expense-form">
              <div class="form-row">
                <label>Sort by date</label>
                <div class="chart-type-toggle">
                  <button
                    type="button"
                    class=${sortOrder === 'desc' ? 'accent small' : 'ghost small'}
                    onClick=${() => setSortOrder('desc')}
                  >Newest first</button>
                  <button
                    type="button"
                    class=${sortOrder === 'asc' ? 'accent small' : 'ghost small'}
                    onClick=${() => setSortOrder('asc')}
                  >Oldest first</button>
                </div>
              </div>

              <div class="two-col">
                <div class="form-row">
                  <label for="filt-from">From account</label>
                  <${AccountPicker}
                    inputId="filt-from"
                    accounts=${data.accounts}
                    value=${filterFrom}
                    onChange=${setFilterFrom}
                    placeholder="Any account"
                    allowClear
                  />
                </div>
                <div class="form-row">
                  <label for="filt-to">To account</label>
                  <${AccountPicker}
                    inputId="filt-to"
                    accounts=${data.accounts}
                    value=${filterTo}
                    onChange=${setFilterTo}
                    placeholder="Any account"
                    allowClear
                  />
                </div>
              </div>

              <div class="two-col">
                <div class="form-row">
                  <label for="filt-date-from">From date</label>
                  <input id="filt-date-from" type="date" value=${filterDateFrom} onInput=${e => setFilterDateFrom(e.target.value)} />
                </div>
                <div class="form-row">
                  <label for="filt-date-to">To date</label>
                  <input id="filt-date-to" type="date" value=${filterDateTo} onInput=${e => setFilterDateTo(e.target.value)} />
                </div>
              </div>

              <div class="form-row">
                <label for="filt-group">Group</label>
                <select id="filt-group" value=${filterGroupId} onChange=${e => setFilterGroupId(e.target.value)}>
                  <option value="">Any group</option>
                  ${data.groups.map(g => html`<option value=${g.id}>${g.name}</option>`)}
                </select>
              </div>

              <div class="form-actions">
                <button type="button" class="ghost" onClick=${clearFilters}>Clear filters</button>
                <span class="form-actions-right">
                  <button type="button" class="primary" onClick=${() => setShowFilter(false)}>Done</button>
                </span>
              </div>
            </div>
          <//>
        `}
      </div>
    `;
  }

  window.Ledger.components.HistoryView = HistoryView;
})();