(function () {
  const { useState, useEffect, useCallback } = window.Ledger;

  // ---------- Persistence (same pattern as String Creator) ----------
  // Primary store: localStorage, always kept up to date.
  // Optional: a linked file on disk via the File System Access API
  // (Chrome/Edge). When linked, every save also writes to that file, so the
  // data can live outside the browser and be shared/backed up.
  const STORAGE_KEY = 'expense_tracker_data_v1';
  const FILE_META_KEY = 'expense_tracker_file_meta_v1'; // {name}
  const DB_NAME = 'expenseTrackerFS';

  const fsSupported = 'showOpenFilePicker' in window && 'showDirectoryPicker' in window;

  function defaultData() {
    return {
      accounts: [
        { id: 'assets.bank_accounts.checkings', title: 'checkings' },
        { id: 'expenses', title: 'expenses' }
      ],
      transactions: [],
      groups: [],
      groupTransactions: [],
      settings: {
        defaultAccountId: 'assets.bank_accounts.checkings'
      }
    };
  }

  function slugify(s) {
    return String(s || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'account';
  }

  function normalize(parsed) {
    const base = defaultData();
    if (!parsed || typeof parsed !== 'object') return base;

    // Accounts used to be { id: number, name, type }. They're now
    // { id: 'expenses.groceries.edeka', title }. When we hit the old shape
    // we synthesize a path from the name/type and remember the old numeric
    // id so any transactions pointing at it can be remapped below.
    const legacyIdMap = {}; // old numeric id -> new string id
    const seenIds = new Set();

    function uniqueId(candidate) {
      let id = candidate;
      let n = 2;
      while (seenIds.has(id)) { id = candidate + '_' + n; n++; }
      seenIds.add(id);
      return id;
    }

    const rawAccounts = Array.isArray(parsed.accounts) && parsed.accounts.length ? parsed.accounts : base.accounts;
    const accounts = rawAccounts
      .filter(a => a && typeof a === 'object')
      .map(a => {
        if (typeof a.id === 'string' && a.id && a.title) {
          const id = uniqueId(a.id);
          return { id, title: String(a.title) };
        }
        // Legacy shape.
        const title = String(a.title || a.name || 'Account');
        const prefix = a.type === 'asset' ? 'assets' : 'expenses';
        const id = uniqueId(prefix + '.' + slugify(title));
        if (a.id !== undefined) legacyIdMap[String(a.id)] = id;
        return { id, title };
      });

    function mapAccountRef(val) {
      if (val == null || val === '') return null;
      const key = String(val);
      if (legacyIdMap[key]) return legacyIdMap[key];
      return key;
    }

    // Transactions used to carry groupId/splits inline. That link now
    // lives in a separate groupTransactions table, so we read the old
    // fields here (if present) just long enough to migrate them below,
    // then drop them from the transaction's own shape.
    const rawTransactions = Array.isArray(parsed.transactions)
      ? parsed.transactions
          .filter(t => t && typeof t === 'object')
          .map(t => ({
            id: Number(t.id),
            date: String(t.date || ''),
            title: String(t.title || ''),
            amount: Number(t.amount) || 0,
            from: mapAccountRef(t.from),
            to: mapAccountRef(t.to),
            legacyGroupId: t.groupId != null && t.groupId !== '' ? Number(t.groupId) : null,
            legacySplits: Array.isArray(t.splits)
              ? t.splits.map(s => ({ member: String(s.member || ''), amount: Number(s.amount) || 0 }))
              : null
          }))
      : [];

    const transactions = rawTransactions.map(({ legacyGroupId, legacySplits, ...t }) => t);

    const groups = Array.isArray(parsed.groups)
      ? parsed.groups
          .filter(g => g && typeof g === 'object')
          .map(g => ({
            id: Number(g.id),
            name: String(g.name || ''),
            members: Array.isArray(g.members) ? g.members.map(String) : [],
            budget: g.budget != null && g.budget !== '' && !Number.isNaN(Number(g.budget)) ? Number(g.budget) : null
          }))
      : [];
    const groupIds = new Set(groups.map(g => g.id));

    let nextGroupTxId = 1;
    const groupTransactions = [];

    // New-format links, if this data was already saved under the new shape.
    if (Array.isArray(parsed.groupTransactions)) {
      parsed.groupTransactions
        .filter(gt => gt && typeof gt === 'object')
        .forEach(gt => {
          const groupId = Number(gt.groupId);
          const transactionId = Number(gt.transactionId);
          if (!groupIds.has(groupId)) return; // orphaned reference, drop it
          const splits = Array.isArray(gt.splits)
            ? gt.splits.map(s => ({ member: String(s.member || ''), amount: Number(s.amount) || 0 }))
            : [];
          groupTransactions.push({ id: nextGroupTxId++, groupId, transactionId, splits });
        });
    }

    // Legacy migration: transactions that still carry the old inline
    // groupId/splits fields get converted into join-table rows.
    rawTransactions.forEach(t => {
      if (t.legacyGroupId != null && groupIds.has(t.legacyGroupId)) {
        groupTransactions.push({
          id: nextGroupTxId++,
          groupId: t.legacyGroupId,
          transactionId: t.id,
          splits: t.legacySplits || []
        });
      }
    });

    const settings = {
      defaultAccountId: parsed.settings && typeof parsed.settings.defaultAccountId === 'string' && parsed.settings.defaultAccountId
        ? mapAccountRef(parsed.settings.defaultAccountId)
        : (base.settings ? base.settings.defaultAccountId : null)
    };

    return { accounts, transactions, groups, groupTransactions, settings };
  }

  // ---------- IndexedDB (stores the FileSystemFileHandle — can't go in localStorage) ----------
  function idbOpen() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore('handles'); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function idbSet(key, val) {
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('handles', 'readwrite');
      tx.objectStore('handles').put(val, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  async function idbGet(key) {
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('handles', 'readonly');
      const req = tx.objectStore('handles').get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }
  async function idbDelete(key) {
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('handles', 'readwrite');
      tx.objectStore('handles').delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function verifyPermission(handle, mode) {
    const opts = { mode };
    if ((await handle.queryPermission(opts)) === 'granted') return true;
    if ((await handle.requestPermission(opts)) === 'granted') return true;
    return false;
  }

  // ---------- Hook ----------
  // Returns { data, update, fileStatus, ...fileActions }. `data` is null
  // while the initial load (localStorage + possible file reconnect) is in
  // flight, so components should render a light "loading" state until then.
  function useStore() {
    const [data, setData] = useState(null);
    const [fileHandle, setFileHandle] = useState(null);
    const [needsReconnect, setNeedsReconnect] = useState(false);
    const [fileError, setFileError] = useState('');
    const [status, setStatus] = useState('');

    const persistLocal = useCallback(d => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
    }, []);

    const writeToFile = useCallback(async (d, handle) => {
      if (!handle) return;
      try {
        const ok = await verifyPermission(handle, 'readwrite');
        if (!ok) { setNeedsReconnect(true); return; }
        const writable = await handle.createWritable();
        await writable.write(JSON.stringify(d, null, 2));
        await writable.close();
        setFileError('');
      } catch (err) {
        console.error('File write failed', err);
        setFileError("Couldn't save to the linked file — your data is still safe in this browser.");
      }
    }, []);

    // Central mutation entry point. Pass either a new object or an
    // updater(prevData) => nextData function.
    const update = useCallback(updater => {
      setData(prev => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        persistLocal(next);
        if (fileHandle) writeToFile(next, fileHandle);
        return next;
      });
    }, [fileHandle, persistLocal, writeToFile]);

    useEffect(() => {
      (async () => {
        let loaded = null;
        try {
          const raw = localStorage.getItem(STORAGE_KEY);
          if (raw) loaded = normalize(JSON.parse(raw));
        } catch (err) {
          console.error('Failed to load data from storage', err);
        }
        if (!loaded) {
          loaded = defaultData();
          persistLocal(loaded);
        }
        setData(loaded);

        if (fsSupported) {
          const meta = localStorage.getItem(FILE_META_KEY);
          if (meta) {
            try {
              const handle = await idbGet('main');
              if (handle) {
                setFileHandle(handle);
                const perm = await handle.queryPermission({ mode: 'readwrite' });
                if (perm === 'granted') {
                  const file = await handle.getFile();
                  const text = (await file.text()).trim();
                  if (text) {
                    const parsed = normalize(JSON.parse(text));
                    setData(parsed);
                    persistLocal(parsed);
                  }
                } else {
                  setNeedsReconnect(true);
                }
              }
            } catch (err) {
              console.error('File reconnection check failed', err);
            }
          }
        }
      })();
      // eslint-disable-next-line
    }, []);

    const connectExisting = useCallback(async () => {
      try {
        const [handle] = await window.showOpenFilePicker({
          types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
          excludeAcceptAllOption: false,
          multiple: false
        });
        const ok = await verifyPermission(handle, 'readwrite');
        if (!ok) throw new Error('Permission was not granted.');
        const file = await handle.getFile();
        const text = (await file.text()).trim();
        const parsed = text ? normalize(JSON.parse(text)) : defaultData();
        await idbSet('main', handle);
        localStorage.setItem(FILE_META_KEY, JSON.stringify({ name: handle.name }));
        setFileHandle(handle);
        setNeedsReconnect(false);
        setFileError('');
        setData(parsed);
        persistLocal(parsed);
        setStatus(`Linked "${handle.name}".`);
      } catch (err) {
        if (err.name !== 'AbortError') alert('Could not open that file: ' + err.message);
      }
    }, [persistLocal]);

    const connectNew = useCallback(async () => {
      try {
        const dirHandle = await window.showDirectoryPicker();
        let name = prompt('Name for the new data file:', 'expenses.json');
        if (name === null) return;
        name = name.trim() || 'expenses.json';
        if (!name.toLowerCase().endsWith('.json')) name += '.json';
        const handle = await dirHandle.getFileHandle(name, { create: true });
        const ok = await verifyPermission(handle, 'readwrite');
        if (!ok) throw new Error('Permission was not granted.');
        const file = await handle.getFile();
        const text = (await file.text()).trim();
        await idbSet('main', handle);
        localStorage.setItem(FILE_META_KEY, JSON.stringify({ name: handle.name }));
        setFileHandle(handle);
        setNeedsReconnect(false);
        setFileError('');
        if (text) {
          const parsed = normalize(JSON.parse(text));
          setData(parsed);
          persistLocal(parsed);
        } else {
          setData(prev => {
            const current = prev || defaultData();
            writeToFile(current, handle);
            return current;
          });
        }
        setStatus(`Linked "${handle.name}".`);
      } catch (err) {
        if (err.name !== 'AbortError') alert('Could not set up that file: ' + err.message);
      }
    }, [persistLocal, writeToFile]);

    const reconnect = useCallback(async () => {
      if (!fileHandle) return;
      try {
        const ok = await verifyPermission(fileHandle, 'readwrite');
        if (!ok) { setNeedsReconnect(true); return; }
        const file = await fileHandle.getFile();
        const text = (await file.text()).trim();
        if (text) {
          const parsed = normalize(JSON.parse(text));
          setData(parsed);
          persistLocal(parsed);
        }
        setNeedsReconnect(false);
        setFileError('');
      } catch (err) {
        setFileError("Couldn't read the linked file: " + err.message);
      }
    }, [fileHandle, persistLocal]);

    const disconnect = useCallback(async () => {
      await idbDelete('main');
      localStorage.removeItem(FILE_META_KEY);
      setFileHandle(null);
      setNeedsReconnect(false);
      setFileError('');
    }, []);

    const downloadJSON = useCallback(() => {
      if (!data) return;
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      a.href = url;
      a.download = 'expenses-' + stamp + '.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, [data]);

    const uploadJSON = useCallback(file => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = normalize(JSON.parse(reader.result));
          const scope = fileHandle ? 'locally and in the linked file' : 'locally';
          if (!confirm(`Replace current data with the contents of "${file.name}"? This overwrites what's stored ${scope}.`)) return;
          setData(parsed);
          persistLocal(parsed);
          if (fileHandle) writeToFile(parsed, fileHandle);
          setStatus(`Loaded data from "${file.name}".`);
        } catch (err) {
          alert('Could not load file: ' + err.message);
        }
      };
      reader.readAsText(file);
    }, [fileHandle, persistLocal, writeToFile]);

    return {
      data,
      update,
      status,
      setStatus,
      fileStatus: {
        supported: fsSupported,
        handle: fileHandle,
        needsReconnect,
        error: fileError
      },
      connectExisting,
      connectNew,
      reconnect,
      disconnect,
      downloadJSON,
      uploadJSON
    };
  }

  window.Ledger.useStore = useStore;
})();