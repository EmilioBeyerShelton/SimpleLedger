# SimpleLedger — React port

A React + TypeScript rebuild of the SimpleLedger expense tracker (see the
repo root for the original Preact/htm, no-build-step version), sharing one
codebase across web, iOS (Capacitor), and macOS (Electron).

Read `ARCHITECTURE.md` for how it's put together and `.claude/CLAUDE.md`
for the rules to follow when editing it.

## Setup

```bash
npm install
```

## Web

```bash
npm run dev        # dev server at http://localhost:5173
npm run build       # type-checks, then builds dist/
npm run preview     # serve the built dist/
```

## macOS (Electron)

```bash
npm run electron:dev       # Vite dev server + Electron together, with HMR
npm run electron:preview   # build dist/, then launch Electron against it (no HMR)
npm run electron:build     # build + package a .dmg via electron-builder
```

## iOS (Capacitor)

One-time setup (requires Xcode on macOS):

```bash
npx cap add ios
```

Then, each time you want to test on device/simulator:

```bash
npm run cap:ios     # builds the web bundle, syncs it into ios/, opens Xcode
```

Run from Xcode as usual. In `ios/App/App/Info.plist`, add
`UIFileSharingEnabled` (`YES`) and `LSSupportsOpeningDocumentsInPlace`
(`YES`) so the mirrored `ledger-data.json` is visible under
**Files → On My iPhone/iPad → SimpleLedger** — see "iOS" in
`ARCHITECTURE.md` for why that file exists.

## Data

Same JSON shape as the original app (documented in `ARCHITECTURE.md`).
Exports from the original vanilla-JS SimpleLedger, or from this React
build on any platform, are interchangeable via the Settings tab's
download/upload (or share, on iOS).
