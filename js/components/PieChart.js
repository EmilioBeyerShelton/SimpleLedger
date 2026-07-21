(function () {
  const { html } = window.Ledger;
  const { formatAmount } = window.Ledger.utils;

  const INNER_RATIO = 0.58; // hole radius as a fraction of the outer radius

  // Turns [{label, value, color}] into an SVG doughnut + a legend. Pure
  // presentational — all the filtering/grouping happens in ReportView.
  function buildSlices(items) {
    const total = items.reduce((s, i) => s + i.value, 0) || 1;
    const cx = 100, cy = 100, r1 = 90, r0 = r1 * INNER_RATIO;
    const point = (r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    let angle = -Math.PI / 2;
    return items.map(item => {
      const fraction = item.value / total;
      const start = angle;
      const end = angle + fraction * Math.PI * 2;
      angle = end;
      const largeArc = end - start > Math.PI ? 1 : 0;
      const [xo1, yo1] = point(r1, start);
      const [xo2, yo2] = point(r1, end);
      const [xi2, yi2] = point(r0, end);
      const [xi1, yi1] = point(r0, start);
      const path = `M ${xo1.toFixed(2)},${yo1.toFixed(2)} `
        + `A ${r1},${r1} 0 ${largeArc},1 ${xo2.toFixed(2)},${yo2.toFixed(2)} `
        + `L ${xi2.toFixed(2)},${yi2.toFixed(2)} `
        + `A ${r0},${r0} 0 ${largeArc},0 ${xi1.toFixed(2)},${yi1.toFixed(2)} Z`;
      return { ...item, path, percent: fraction * 100 };
    });
  }

  function PieChart({ slices }) {
    const built = buildSlices(slices);
    const total = slices.reduce((s, i) => s + i.value, 0);
    const r1 = 90, r0 = r1 * INNER_RATIO;

    return html`
      <div class="pie-wrap">
        <svg viewBox="0 0 200 200" class="pie-svg">
          ${built.length === 1
            ? html`
              <path
                fill-rule="evenodd"
                fill=${built[0].color}
                d="M 100,${100 - r1} A ${r1},${r1} 0 1 0 100,${100 + r1} A ${r1},${r1} 0 1 0 100,${100 - r1}
                   M 100,${100 - r0} A ${r0},${r0} 0 1 0 100,${100 + r0} A ${r0},${r0} 0 1 0 100,${100 - r0}"
              />
            `
            : built.map(s => html`<path d=${s.path} fill=${s.color} />`)}
          <text x="100" y="94" text-anchor="middle" class="pie-center-label">Total</text>
          <text x="100" y="112" text-anchor="middle" class="pie-center-value">${formatAmount(total)}</text>
        </svg>
        <div class="pie-legend">
          ${built.map(s => html`
            <div class="pie-legend-row">
              <span class="pie-swatch" style=${`background:${s.color}`}></span>
              <span class="pie-legend-label">${s.label}</span>
              <span class="pie-legend-value">${formatAmount(s.value)} · ${s.percent.toFixed(1)}%</span>
            </div>
          `)}
        </div>
      </div>
    `;
  }

  window.Ledger.components.PieChart = PieChart;
})();
