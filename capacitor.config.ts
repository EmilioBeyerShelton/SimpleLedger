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
    }
  }
};

export default config;
