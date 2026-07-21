// Loaded after the three CDN <script> tags (preact, preact hooks, htm UMD
// builds), which attach `preact`, `preactHooks`, and `htm` as plain
// globals. This file just gathers everything the app needs into one
// window.Ledger namespace so every other file can pull from one place
// instead of poking at three different globals.
//
// Deliberately NOT an ES module: type="module" scripts are fetched with
// CORS rules that Chrome/Firefox refuse to satisfy for file:// pages, which
// is the "CORS error" you hit. Plain <script src="..."> tags don't have
// that restriction, so this whole app uses those instead — that's also why
// each file below wraps itself in an IIFE rather than using import/export.
(function () {
  window.Ledger = {
    h: preact.h,
    Fragment: preact.Fragment,
    render: preact.render,
    useState: preactHooks.useState,
    useEffect: preactHooks.useEffect,
    useMemo: preactHooks.useMemo,
    useRef: preactHooks.useRef,
    useCallback: preactHooks.useCallback,
    html: htm.bind(preact.h),
    utils: {},      // filled in by utils.js
    components: {}  // filled in by each file in js/components/
  };
})();
