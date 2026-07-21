(function () {
  const { html, useRef } = window.Ledger;

  function Modal({ title, onClose, children, maxWidth }) {
    const mouseDownOnSelf = useRef(false);

    return html`
      <div
        class="overlay"
        onMouseDown=${e => { mouseDownOnSelf.current = e.target === e.currentTarget; }}
        onMouseUp=${e => {
          if (mouseDownOnSelf.current && e.target === e.currentTarget) onClose();
          mouseDownOnSelf.current = false;
        }}
      >
        <div class="modal" style=${maxWidth ? `max-width:${maxWidth}` : ''}>
          <div class="modal-head">
            <h2>${title}</h2>
            <button class="ghost small" onClick=${onClose}>✕ Close</button>
          </div>
          <div class="modal-body">
            ${children}
          </div>
        </div>
      </div>
    `;
  }

  window.Ledger.components.Modal = Modal;
})();
