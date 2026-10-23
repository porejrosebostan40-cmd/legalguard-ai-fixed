import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.legalguard.ai',
  appName: 'LegalGuard AI',
  webDir: 'dist',
  server: {
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
  },
};

export default config;
