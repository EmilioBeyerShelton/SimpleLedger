(function () {
  const { html, useState, useMemo } = window.Ledger;
  const { formatAmount } = window.Ledger.utils;

  const PALETTE = ['#2f5d50', '#c98a1f', '#7a4fa3', '#2f7f8f', '#a3452f', '#4f7a2f', '#a34f8a', '#5f5f5f', '#2f5da3', '#8a6b2f'];

  function truncatePath(id, depth) {
    const parts = String(id).split('.');
    return parts.slice(0, Math.max(1, Math.min(depth, parts.length))).join('.');
  }

  function labelFor(id, accounts) {
    const acc = accounts.find(a => a.id === id);
    if (acc) return acc.title;
    const last = String(id).split('.').pop();
    return last.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  // Builds a chain of hierarchy levels between the selected account and
  // each counterpart, always at full depth (no truncation), and sums
  // amounts onto each consecutive pair as a sankey link.
  function buildSankeyData(filtered, accountId, mode, accounts) {
    const linkTotals = new Map(); // "from→to" -> amount
    const nodeIds = new Set([accountId]);

    filtered.forEach(t => {
      const counterpart = mode === 'from' ? t.to : t.from;
      const parts = String(counterpart).split('.');
      const levels = parts.map((_, i) => parts.slice(0, i + 1).join('.'));
      const chain = mode === 'from' ? [accountId, ...levels] : [...levels, accountId];
      chain.forEach(id => nodeIds.add(id));
      for (let i = 0; i < chain.length - 1; i++) {
        const key = chain[i] + '→' + chain[i + 1];
        linkTotals.set(key, (linkTotals.get(key) || 0) + t.amount);
      }
    });

    function depthOf(id) { return String(id).split('.').length; }
    const otherDepths = [...nodeIds].filter(id => id !== accountId).map(depthOf);
    const maxOtherDepth = otherDepths.length ? Math.max(...otherDepths) : 0;

    const nodes = [...nodeIds].map(id => {
      const column = id === accountId
        ? (mode === 'from' ? 0 : maxOtherDepth)
        : (mode === 'from' ? depthOf(id) : depthOf(id) - 1);
      return { id, label: labelFor(id, accounts), column };
    });

    const links = [...linkTotals.entries()].map(([key, value]) => {
      const [source, target] = key.split('→');
      return { source, target, value };
    });

    return { nodes, links };
  }

  function ReportView({ data }) {
    const { AccountPicker, PieChart, SankeyChart } = window.Ledger.components;
    const defaultId = data.settings ? data.settings.defaultAccountId : null;

    const [accountId, setAccountId] = useState(defaultId || (data.accounts[0] && data.accounts[0].id) || '');
    const [mode, setMode] = useState('from'); // 'from' = money leaving the account, 'to' = money arriving
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [depth, setDepth] = useState(2);
    const [chartType, setChartType] = useState('pie'); // 'pie' | 'sankey'

    const filtered = useMemo(() => {
      return data.transactions.filter(t => {
        const matchesAccount = mode === 'from' ? t.from === accountId : t.to === accountId;
        if (!matchesAccount) return false;
        if (dateFrom && t.date < dateFrom) return false;
        if (dateTo && t.date > dateTo) return false;
        return true;
      });
    }, [data.transactions, accountId, mode, dateFrom, dateTo]);

    const maxDepth = useMemo(() => {
      let max = 1;
      filtered.forEach(t => {
        const counterpart = mode === 'from' ? t.to : t.from;
        max = Math.max(max, String(counterpart).split('.').length);
      });
      return max;
    }, [filtered, mode]);

    const effectiveDepth = Math.min(depth, maxDepth);

    const grouped = useMemo(() => {
      const totals = {};
      filtered.forEach(t => {
        const counterpart = mode === 'from' ? t.to : t.from;
        const key = truncatePath(counterpart, effectiveDepth);
        totals[key] = (totals[key] || 0) + t.amount;
      });
      return Object.entries(totals)
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value);
    }, [filtered, mode, effectiveDepth]);

    const total = grouped.reduce((s, g) => s + g.value, 0);
    const slices = grouped.map((g, i) => ({ ...g, color: PALETTE[i % PALETTE.length] }));
    const accountTitle = (data.accounts.find(a => a.id === accountId) || {}).title || accountId || '—';

    const sankeyData = useMemo(
      () => buildSankeyData(filtered, accountId, mode, data.accounts),
      [filtered, accountId, mode, data.accounts]
    );

    if (data.accounts.length === 0) {
      return html`
        <div class="view">
          <h2 class="view-title">Report</h2>
          <p class="empty-note">Add an account first — the Accounts tab.</p>
        </div>
      `;
    }

    return html`
      <div class="view">
        <h2 class="view-title">Report</h2>

        <div class="report-controls">
          <div class="form-row">
            <label for="r-account">Account</label>
            <${AccountPicker}
              inputId="r-account"
              accounts=${data.accounts}
              value=${accountId}
              onChange=${setAccountId}
              placeholder="Type or pick an account"
            />
          </div>

          <label class="checkbox-row">
            <input type="checkbox" checked=${mode === 'to'} onChange=${e => setMode(e.target.checked ? 'to' : 'from')} />
            Show transactions going to this account instead
          </label>

          <div class="two-col">
            <div class="form-row">
              <label for="r-from-date">From date</label>
              <input id="r-from-date" type="date" value=${dateFrom} onInput=${e => setDateFrom(e.target.value)} />
            </div>
            <div class="form-row">
              <label for="r-to-date">To date</label>
              <input id="r-to-date" type="date" value=${dateTo} onInput=${e => setDateTo(e.target.value)} />
            </div>
          </div>

          ${chartType === 'pie' && html`
            <div class="form-row">
              <label for="r-depth">Group by depth — ${effectiveDepth} of ${maxDepth}</label>
              <input
                id="r-depth"
                type="range"
                min="1"
                max=${maxDepth}
                step="1"
                value=${effectiveDepth}
                disabled=${maxDepth <= 1}
                onInput=${e => setDepth(Number(e.target.value))}
              />
            </div>
          `}
        </div>

        <p class="view-sub">
          ${filtered.length} expense${filtered.length === 1 ? '' : 's'} ${mode === 'from' ? 'from' : 'to'} <b>${accountTitle}</b>
          ${(dateFrom || dateTo) ? html` between ${dateFrom || '…'} and ${dateTo || '…'}` : ''}
          — total ${formatAmount(total)}
        </p>

        <div class="chart-type-toggle">
          <button class=${chartType === 'pie' ? 'accent small' : 'ghost small'} onClick=${() => setChartType('pie')}>Pie</button>
          <button class=${chartType === 'sankey' ? 'accent small' : 'ghost small'} onClick=${() => setChartType('sankey')}>Sankey (full depth)</button>
        </div>

        ${chartType === 'pie'
          ? (slices.length === 0
              ? html`<p class="empty-note">No matching expenses.</p>`
              : html`<${PieChart} slices=${slices} />`)
          : html`<${SankeyChart} nodes=${sankeyData.nodes} links=${sankeyData.links} />`}
      </div>
    `;
  }

  window.Ledger.components.ReportView = ReportView;
})();
