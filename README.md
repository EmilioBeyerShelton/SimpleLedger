# Ledger — a lightweight expense tracker

Preact + `htm`, no build step, split into small component files. Same
persistence pattern as String Creator: localStorage always, with an
optional linked JSON file on disk via the File System Access API
(Chrome/Edge), plus Download/Upload buttons as a manual backup.

## Running it

Just double-click `index.html` — it opens directly from disk (`file://`),
no local server required. Preact/htm load from a CDN as classic scripts
(not ES modules), which sidesteps the CORS restriction browsers place on
`type="module"` imports over `file://`. You do need an internet connection
for that first CDN load.

If you'd rather self-host it fully offline, download the three CDN files
referenced at the top of `index.html` into a local `vendor/` folder and
update the three `<script src="...">` URLs to point there instead.

## How it works

- **Add an expense**: only Title and Amount are required. Everything else
  (date, accounts, group split) is tucked behind "+ Date, accounts, split
  with a group" so filing something takes two taps.
- **Accounts are categories**: every expense is a transfer from one account
  to another (h-ledger style) — money always flows *from* somewhere *to*
  somewhere. Each account has a **title** (what's shown, e.g. "EDEKA") and a
  **path id** (what you filter/select by, e.g. `expenses.groceries.edeka`).
  In the From/To fields, type part of a path (`expenses.groceries`) or part
  of a title (`EDEKA`) to filter, or just click a match. Manage accounts
  from the Accounts tab — tap "+ Add account" or tap a row to open an
  add/edit dialog; deleting is in that dialog too. One account can be
  marked "Default" there, which is what's pre-selected as "From" whenever
  you add a new expense (starts out as `checkings`).
- **Groups**: create a group with a few members, then split any expense
  across them. Splitting is even by default, editable per person, and just
  tracks who owes what — it doesn't move extra money on its own.
- **Search and filters**: the History tab has a search bar (matches title,
  and the From/To account's title or path) and a filter icon next to it —
  tap it for a modal to narrow by From account, To account, a date range,
  and/or group. The badge on the icon shows how many filters are active;
  "Clear filters" in the modal resets them.
- **Settings tab**: this is where data storage lives — link/unlink a file
  on disk via the File System Access API, and download/upload manual JSON
  backups. Everywhere else (the header on every page) just shows a short
  one-line status ("Stored in this browser" / "Synced to expenses.json").
- **Report tab**: pick an account (defaults to your Settings default account),
  and see a pie chart of everything it paid out to. Flip the checkbox to see
  the reverse — everything that flowed in. Add a from/to date range to
  narrow the window, and drag the depth slider to control how counterpart
  accounts are grouped: at depth 1 `expenses.groceries.edeka` and
  `expenses.groceries.rewe` collapse into one `expenses.groceries` slice; at
  full depth every exact account gets its own slice. Switch to the "Sankey"
  chart type for a flow diagram through the full account hierarchy at once
  (no depth control needed there — it always shows every level).

## Files

```
index.html               shell + all styling (design lifted from String Creator)
                          + the CDN <script> tags for Preact/htm, in load order
js/lib.js                 gathers preact/preactHooks/htm globals into window.Ledger
js/utils.js                id/formatting/ledger-math helpers -> Ledger.utils
js/store.js                 persistence: localStorage + optional linked file -> Ledger.useStore
js/app.js                    top-level App: tab routing, wires the store to views
js/components/
  Modal.js                   small reusable overlay
  TopBar.js                  short read-only storage status (shown on every page)
  BottomNav.js                mobile tab bar (top row on desktop)
  AccountPicker.js             type-to-filter combobox for account fields
  ExpenseForm.js                the add/edit form (title, amount, split UI)
  HistoryView.js                 expense list + add/edit modals
  AccountForm.js                  add/edit dialog for an account
  AccountsView.js                  account list, balances, default marker
  GroupsView.js                     groups, member totals, create/delete
  SettingsView.js                    file linking + download/upload backups
  PieChart.js                         pure SVG pie chart + legend
  SankeyChart.js                       pure SVG sankey layout + renderer
  ReportView.js                          account picker, date range, chart-type toggle
```

Every file is a classic (non-module) script that attaches what it exports
to `window.Ledger` — e.g. `window.Ledger.components.TopBar` — instead of
using `import`/`export`. `index.html` loads them in dependency order.
That's the deliberate choice that makes `file://` work: `type="module"`
scripts are fetched under CORS rules that reject `file://` origins, but
plain `<script src="...">` tags aren't.

## Troubleshooting

Seeing an error mentioning a variable that "is undefined" right after an
update? That's almost always a stale cached copy of one `.js` file next to
a fresh copy of another. Each local script tag in `index.html` has a
`?v=N` query string for exactly this reason — do a hard refresh
(Ctrl/Cmd+Shift+R) if it happens, and bump the `v` number if you edit the
files yourself and hit it again.

## Data shape

```json
{
  "accounts": [{ "id": "assets.bank_accounts.checkings", "title": "checkings" }],
  "transactions": [{
    "id": 1, "date": "2026-07-21", "title": "Groceries", "amount": 42.5,
    "from": "assets.bank_accounts.checkings", "to": "expenses.groceries.edeka",
    "groupId": null, "splits": null
  }],
  "groups": [{ "id": 1, "name": "Roommates", "members": ["Alex", "Sam"] }],
  "settings": { "defaultAccountId": "assets.bank_accounts.checkings" }
}
```