(function () {
  const { html, useRef } = window.Ledger;

  function SettingsView({ store }) {
    const { data, update, fileStatus, connectExisting, connectNew, reconnect, disconnect, downloadJSON, uploadJSON } = store;
    const uploadInput = useRef(null);
    const { AccountPicker } = window.Ledger.components;

    const defaultId = data.settings ? data.settings.defaultAccountId : null;

    function setDefaultAccount(id) {
      update(d => ({ ...d, settings: { ...d.settings, defaultAccountId: id } }));
    }

    return html`
      <div class="view">
        <h2 class="view-title">Settings</h2>

        <div class="settings-section">
          <h3 class="settings-heading">Default account</h3>
          <p class="view-sub">Pre-selected as "From" whenever you add a new expense. You can also set this from an account's edit dialog.</p>
          <div class="settings-card">
            <${AccountPicker}
              accounts=${data.accounts}
              value=${defaultId}
              onChange=${setDefaultAccount}
              placeholder="Type or pick an account"
            />
          </div>
        </div>

        <div class="settings-section">
          <h3 class="settings-heading">Data storage</h3>
          <p class="view-sub">
            Everything is always saved in this browser automatically. You can
            optionally also link a JSON file on disk — every change is then
            written there too, so the data can live outside the browser and
            be backed up or synced yourself.
          </p>

          <div class="settings-card">
            <div class="file-status-group ${fileStatus.needsReconnect ? 'state-reconnect' : (fileStatus.handle ? (fileStatus.error ? 'state-error' : 'state-connected') : '')}">
              <span class="dot"></span>
              <span class="fs-msg">
                ${!fileStatus.supported
                  ? 'Linking a file isn\'t supported in this browser'
                  : fileStatus.needsReconnect
                    ? 'Linked file needs reconnecting'
                    : fileStatus.handle
                      ? (fileStatus.error ? fileStatus.error : html`Linked to <b>${fileStatus.handle.name}</b>`)
                      : 'Not linked — browser storage only'}
              </span>
            </div>

            ${fileStatus.supported && html`
              <div class="settings-actions">
                ${fileStatus.needsReconnect && html`
                  <button class="accent small" onClick=${reconnect}>Reconnect</button>
                  <button class="ghost small" onClick=${disconnect}>Unlink</button>
                `}
                ${!fileStatus.needsReconnect && fileStatus.handle && html`
                  <button class="ghost small" onClick=${connectExisting}>Change file…</button>
                  <button class="ghost small" onClick=${disconnect}>Unlink</button>
                `}
                ${!fileStatus.needsReconnect && !fileStatus.handle && html`
                  <button class="ghost small" onClick=${connectExisting}>Open existing file…</button>
                  <button class="ghost small" onClick=${connectNew}>Create new file…</button>
                `}
              </div>
            `}
          </div>
        </div>

        <div class="settings-section">
          <h3 class="settings-heading">Manual backup</h3>
          <p class="view-sub">Save a snapshot to your downloads, or load one back in — handy regardless of whether a file is linked.</p>
          <div class="settings-actions">
            <button class="ghost small" onClick=${downloadJSON}>Download JSON</button>
            <button class="ghost small" onClick=${() => uploadInput.current.click()}>Upload JSON</button>
            <input
              type="file"
              ref=${uploadInput}
              class="file-input-hidden"
              accept="application/json,.json"
              onChange=${e => {
                const file = e.target.files[0];
                if (file) uploadJSON(file);
                e.target.value = '';
              }}
            />
          </div>
        </div>
      </div>
    `;
  }

  window.Ledger.components.SettingsView = SettingsView;
})();
