# Project rules — SimpleLedger (portToReact)

Read `ARCHITECTURE.md` first for the why. This file is the how — rules to
follow when adding or changing code here.

## Non-negotiables

1. **Never import platform-specific persistence code outside `src/lib/persistence/`.**
   Pages, components, and the Zustand store talk to the `PersistenceAdapter`
   interface (`src/lib/persistence/types.ts`) only. If you need a new
   persistence capability, add it to the interface and implement it in all
   three adapters (`web.ts`, `capacitor.ts`, `electron.ts`) — not just the
   one you're testing against.
2. **One data shape, everywhere.** `LedgerData` (`src/types/ledger.ts`) is
   the schema. Don't add platform-specific fields to it. Any new field
   must be optional/backfillable so old exports still `normalize()`
   correctly — update `src/lib/persistence/normalize.ts` in the same
   change if the shape grows.
3. **Business logic stays in `src/lib/utils/ledger.ts` and the store, not
   in components.** Balance math, budget splitting, date bucketing — pure
   functions, unit-testable, no React/DOM. Components call them; they
   don't reimplement them.
4. **shadcn/ui components in `src/components/ui/` are vendored, not npm
   packages.** Edit them directly when you need a variant; don't wrap them
   in another abstraction layer. If you add a new shadcn primitive, follow
   the existing file shape (Radix primitive + `cva` + `cn()`,
   `forwardRef`, `displayName`).
5. **Mobile-first.** Default Tailwind classes target the narrow/mobile
   layout; use `sm:`/`md:` to progressively enhance for wider viewports.
   Test any new page or dialog at ~375px width before calling it done.
   Respect safe-area insets (`.safe-bottom` utility, or
   `env(safe-area-inset-*)` directly) for anything pinned to a screen
   edge.
6. **No `localStorage`/`indexedDB` calls in components or the store.**
   Those live inside `WebPersistenceAdapter` only, and only for
   *metadata* (the linked file's handle/display name) — never ledger data
   itself, which lives in SQLite. The macOS adapter's `localStorage` use
   is the same: just the linked-file *path* string (see `electron.ts`).
7. **Keep each ported file's header comment pointing at its original.**
   When you touch a file that says "Port of js/components/X.js", keep that
   provenance comment accurate, or remove it once the code has diverged
   enough that the comparison is no longer useful — don't leave it stale.
8. **No raw SQL outside `src/lib/db/`, `main.cjs`'s SQLite section, and the
   two adapters that drive a `SqlExecutor` (`web.ts`, `capacitor.ts`).**
   Schema and row-mapping changes go in `src/lib/db/schema.ts` +
   `mapping.ts`, which `ledgerRepository.ts` composes into
   `readLedgerData()`/`writeLedgerData()` — adapters and pages call those,
   they don't write `SELECT`/`INSERT` themselves.
9. **`electron/main.cjs`'s schema/mapping block is a hand-duplicated copy
   of `src/lib/db/schema.ts` + `mapping.ts`, not a bug.** It has to be:
   `main.cjs` runs in the Node main process, outside Vite's module graph,
   and can't `import` TypeScript. Both copies are marked "KEEP IN SYNC" —
   changing the table/column shape in one without the other will silently
   desync macOS from web/iOS. Change both in the same commit.
10. **Writes to SQLite are full-replace (wipe + reinsert in one
    transaction), not incremental.** Don't add per-field `UPDATE`
    statements for individual mutations — `useLedgerStore.ts`'s `mutate()`
    already recomputes the whole `LedgerData` tree per action, and
    `writeLedgerData()` is built around consuming that whole tree. If a
    future feature needs incremental writes for performance, that's a
    `ledgerRepository.ts` change, not something to bolt onto individual
    adapters.
11. **Manual backup/restore (`downloadBackup`/`uploadBackup`) produces and
    consumes raw `.sqlite3` files, on every platform, matching the
    live/linked stores.** Don't make backups go back to JSON. `uploadBackup()`
    must still run its result through `normalize()` before it reaches the
    store, so legacy shapes inside a restored database are still handled —
    but the wire format at the platform boundary (web: exported OPFS
    bytes; macOS: a temp-file round trip through `better-sqlite3`; iOS: the
    plugin's native `.db` file read/written directly) is SQLite, not JSON.

## Adding a feature

1. Extend `LedgerData`/`normalize()` if the data shape changes.
2. Add the mutation to `useLedgerStore.ts` (it should call `mutate()`,
   same as every existing mutation — don't call adapter methods directly
   from a page).
3. Add/update the pure logic in `lib/utils/ledger.ts` if there's math or
   formatting involved.
4. Build the UI in `pages/` or `components/`, using existing `ui/`
   primitives before adding new ones.
5. Update `ARCHITECTURE.md` if you changed the shape of something
   documented there (data shape, persistence contract, routing).

## Testing before you call something done

- `npm run build` (runs `tsc --noEmit` then `vite build`) must pass clean.
- Manually check the feature at mobile width in the web build
  (`npm run dev`, resize devtools to ~375px) — that's the fastest
  feedback loop and it's what iOS will render.
- If you touched a `PersistenceAdapter` method, reason through all three
  implementations, not just web (which is what you're likely running
  locally). The macOS/iOS ones can't be smoke-tested without an Xcode/
  Electron build, so read them carefully instead.
- If you touched `src/lib/db/schema.ts` or `mapping.ts`, check that
  `electron/main.cjs`'s duplicated copy still matches (rule 9) — `tsc`
  can't catch a desync between a `.ts` file and a `.cjs` file for you.

## Commit hygiene

- Don't commit `ios/`, `dist/`, `dist-electron/`, or `node_modules/` — see
  `.gitignore`. `ios/` is regenerated by `npx cap add ios` /
  `npx cap sync`.
- Keep the original vanilla-JS app at the repo root untouched by changes
  in `portToReact/` — they're independent; this is a from-scratch port,
  not a migration that deletes the old one.
