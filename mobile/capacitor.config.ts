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
  },
  // Without this, the native launch screen (drawable/splash.png, our navy
  // background + logo) disappears the moment MainActivity attaches its
  // content view, leaving a blank white WebView until the remote site
  // finishes loading over the network — the "white screen with no icon"
  // gap. The splash-screen plugin keeps that same branded image showing
  // (auto-hiding once the page has actually loaded, capped at 3s) so
  // there's no unbranded gap between the two.
  plugins: {
    SplashScreen: {
      launchShowDuration: 3000,
      launchAutoHide: true,
      backgroundColor: '#16223F',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: false,
      splashImmersive: false
    }
  }
};

export default config;
