(function () {
  const { html } = window.Ledger;

  // Deliberately minimal: just the title and a one-line "where's my data"
  // status. All the actual storage management (linking a file, download,
  // upload) lives on the Settings page now.
  function TopBar({ fileStatus }) {
    let dotClass = '';
    let msg = 'Stored in this browser';

    if (!fileStatus.supported) {
      msg = 'Stored in this browser';
    } else if (fileStatus.needsReconnect) {
      dotClass = 'state-reconnect';
      msg = 'Linked file needs reconnecting — see Settings';
    } else if (fileStatus.handle) {
      dotClass = fileStatus.error ? 'state-error' : 'state-connected';
      msg = fileStatus.error ? fileStatus.error : html`Synced to <b>${fileStatus.handle.name}</b>`;
    } else {
      msg = 'Stored in this browser';
    }

    return html`
      <div class="topbar">
        <h1>Ledger</h1>
        <div class="file-status-group ${dotClass}">
          <span class="dot"></span>
          <span class="fs-msg">${msg}</span>
        </div>
      </div>
    `;
  }

  window.Ledger.components.TopBar = TopBar;
})();
