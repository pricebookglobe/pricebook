import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.pricebook.app',
  appName: 'PriceBook',
  webDir: 'www',
  // The app is a thin native wrapper around the live PriceBook website.
  // Every screen, search, scan and price report runs against the real,
  // already-deployed site — there is no separate app backend to keep in sync.
  server: {
    url: 'https://pricebook.onrender.com',
    cleartext: false
  },
  android: {
    allowMixedContent: false
  }
};

export default config;
