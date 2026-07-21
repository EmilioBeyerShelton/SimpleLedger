(function () {
  const { html } = window.Ledger;

  const TABS = [
    { id: 'history', label: 'History', icon: '≡' },
    { id: 'report', label: 'Report', icon: '◔' },
    { id: 'accounts', label: 'Accounts', icon: '▤' },
    { id: 'groups', label: 'Groups', icon: '◎' },
    { id: 'settings', label: 'Settings', icon: '⚙' }
  ];

  function BottomNav({ active, onChange }) {
    return html`
      <nav class="bottom-nav">
        ${TABS.map(t => html`
          <button
            class="nav-btn ${active === t.id ? 'active' : ''}"
            onClick=${() => onChange(t.id)}
          >
            <span class="nav-icon">${t.icon}</span>
            <span class="nav-label">${t.label}</span>
          </button>
        `)}
      </nav>
    `;
  }

  window.Ledger.components.BottomNav = BottomNav;
})();
