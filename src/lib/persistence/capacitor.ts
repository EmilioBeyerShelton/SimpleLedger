// iOS adapter (Capacitor). Design notes in ARCHITECTURE.md.
//
// iOS has no equivalent of the File System Access API's persistent file
// handle, so "linking a file" here means: mirror every save to a visible
// file in the app's Documents directory (which shows up under
// "On My iPhone/iPad > SimpleLedger" in the Files app when
// UIFileSharingEnabled is set in Info.plist), rather than holding a
// reference to an arbitrary external file. Preferences (NSUserDefaults) is
// the always-on primary store — small, synchronous-feeling, survives
// backups.
import { Preferences } from '@capacitor/preferences';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import type { PersistenceAdapter, LoadResult, FileLinkStatus } from './types';
import { normalize, defaultData } from './normalize';
import type { LedgerData } from '@/types/ledger';

const PREFS_KEY = 'ledger_data_v1';
const LINK_FLAG_KEY = 'ledger_file_linked_v1';
const MIRROR_FILE_NAME = 'ledger-data.json';

export class CapacitorPersistenceAdapter implements PersistenceAdapter {
  platform = 'ios' as const;
  canCreateNewLinkedFile = true;

  private status: FileLinkStatus = {
    supported: true,
    linked: false,
    name: null,
    needsReconnect: false,
    error: null
  };

  getFileStatus(): FileLinkStatus {
    return this.status;
  }

  async persistLocal(data: LedgerData): Promise<void> {
    await Preferences.set({ key: PREFS_KEY, value: JSON.stringify(data) });
  }

  async writeLinkedFile(data: LedgerData): Promise<FileLinkStatus | null> {
    if (!this.status.linked) return null;
    try {
      await Filesystem.writeFile({
        path: MIRROR_FILE_NAME,
        directory: Directory.Documents,
        data: JSON.stringify(data, null, 2),
        encoding: Encoding.UTF8
      });
      this.status = { ...this.status, error: null };
    } catch (err: any) {
      console.error('Mirror file write failed', err);
      this.status = { ...this.status, error: "Couldn't update the Files app copy — your data is still safe on this device." };
    }
    return this.status;
  }

  async loadInitial(): Promise<LoadResult> {
    let loaded: LedgerData | null = null;
    try {
      const { value } = await Preferences.get({ key: PREFS_KEY });
      if (value) loaded = normalize(JSON.parse(value));
    } catch (err) {
      console.error('Failed to load data from Preferences', err);
    }
    if (!loaded) {
      loaded = defaultData();
      await this.persistLocal(loaded);
    }

    const { value: linkedFlag } = await Preferences.get({ key: LINK_FLAG_KEY });
    if (linkedFlag === 'true') {
      this.status = { supported: true, linked: true, name: MIRROR_FILE_NAME, needsReconnect: false, error: null };
      await this.writeLinkedFile(loaded);
    }

    return { data: loaded, fileStatus: this.status };
  }

  // iOS has no persistent external-file handle API, so "connect existing"
  // means: import a JSON file the user picks (via the OS document picker,
  // triggered through a plain <input type="file"> which iOS's WKWebView
  // routes to the native Files picker), then start mirroring going
  // forward. See uploadBackup for the actual read.
  async connectExisting(): Promise<LoadResult | null> {
    return null; // handled by the Settings UI calling uploadBackup, then connectNew() to start mirroring.
  }

  async connectNew(): Promise<LoadResult | null> {
    const { value } = await Preferences.get({ key: PREFS_KEY });
    const data = value ? normalize(JSON.parse(value)) : defaultData();
    await Preferences.set({ key: LINK_FLAG_KEY, value: 'true' });
    this.status = { supported: true, linked: true, name: MIRROR_FILE_NAME, needsReconnect: false, error: null };
    await this.writeLinkedFile(data);
    return { data, fileStatus: this.status };
  }

  async reconnect(): Promise<LoadResult | null> {
    try {
      const result = await Filesystem.readFile({
        path: MIRROR_FILE_NAME,
        directory: Directory.Documents,
        encoding: Encoding.UTF8
      });
      const text = typeof result.data === 'string' ? result.data : await (result.data as Blob).text();
      const data = normalize(JSON.parse(text));
      await this.persistLocal(data);
      this.status = { ...this.status, needsReconnect: false, error: null };
      return { data, fileStatus: this.status };
    } catch (err: any) {
      this.status = { ...this.status, error: "Couldn't read the Files app copy: " + err.message };
      return null;
    }
  }

  async disconnect(): Promise<void> {
    await Preferences.remove({ key: LINK_FLAG_KEY });
    this.status = { ...this.status, linked: false, name: null, needsReconnect: false, error: null };
  }

  async downloadBackup(data: LedgerData): Promise<void> {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const fileName = `ledger-${stamp}.json`;
    await Filesystem.writeFile({
      path: fileName,
      directory: Directory.Cache,
      data: JSON.stringify(data, null, 2),
      encoding: Encoding.UTF8
    });
    const { uri } = await Filesystem.getUri({ path: fileName, directory: Directory.Cache });
    await Share.share({ title: 'SimpleLedger backup', url: uri });
  }

  async uploadBackup(file: File): Promise<unknown> {
    const text = await file.text();
    return JSON.parse(text);
  }
}
