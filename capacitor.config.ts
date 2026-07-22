import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.simpleledger.app',
  appName: 'SimpleLedger',
  webDir: 'dist',
  ios: {
    contentInset: 'always'
  },
  plugins: {
    Preferences: {
      group: 'SimpleLedgerGroup'
    },
    CapacitorSQLite: {
      // No user data is encrypted at the SQLite layer — the database
      // itself lives inside the app's sandboxed container, same trust
      // boundary as every other file the app owns.
      iosIsEncryption: false,
      iosDatabaseLocation: 'Library/CapacitorDatabase'
    }
  }
};

export default config;
