package com.pricebook.app;

import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    // "App stuck on the splash screen until I restart it" — reported
    // directly. capacitor.config.ts deliberately turns off the plugin's own
    // timer (launchAutoHide: false) so that the ONLY thing that ever hides
    // the native splash is the web app's own JS, once it's loaded enough to
    // mount and call SplashScreen.hide() (see IntroGate.tsx) — by design,
    // so there's no gap where the splash disappears before the real app is
    // actually ready to show something. The entire site is loaded from the
    // remote server.url (capacitor.config.ts), not bundled into the app, so
    // that JS call depends on a full network round-trip over whatever
    // connection the phone has right now, with NO ceiling on how long that
    // can take and nothing else that will ever hide the splash if it
    // doesn't — a slow mobile connection, or Render's free tier spinning up
    // from a cold start (can take tens of seconds), leaves the splash
    // sitting there with no feedback and no way out except killing the app.
    //
    // Two safety nets below, neither of which can fire on the normal/fast
    // path (both only act if the splash is, in fact, still showing):
    // 1. onReceivedError below force-hides it the instant the main frame
    //    definitively fails to load (no connection, DNS failure, etc.) —
    //    instead of silently sitting on the splash with no sign anything
    //    is wrong, the shopper now at least sees the WebView's own "no
    //    internet" page and can pull-to-refresh/retry from there.
    // 2. SPLASH_TIMEOUT_MS below force-hides it after a generous wait
    //    regardless of what's happening — covers a connection that's slow
    //    rather than outright failing (a real "it eventually loads, just
    //    not quickly" case, which wouldn't fire onReceivedError at all).
    private static final long SPLASH_TIMEOUT_MS = 15000;
    // Guards against both the timeout AND onReceivedError firing (or either
    // firing more than once) — evaluateJavascript below is harmless to call
    // twice, but there's nothing to gain from it either.
    private boolean splashForceHidden = false;

    // "Camera lands me back on [home screen] and doesn't continue adding
    // the item" — the relaunch below (startActivity(new Intent(getIntent())))
    // is what onRenderProcessGone always did once the renderer was killed
    // mid-Snap, and it never carried the page the person was actually on:
    // getIntent() is the app's ORIGINAL launch intent, so the fresh WebView
    // always starts over from capacitor.config.ts's server.url root, which
    // then redirects by role (merchant -> /overview, customer ->
    // /check-price) — never back to /inventory/add. That's the "lands on
    // [home], didn't continue" behavior reported, not a separate bug.
    //
    // This doesn't recover the in-progress draft (that's real React state,
    // gone with the killed renderer) — but it does mean the person lands
    // back on the Add Item page itself afterward, instead of getting
    // bounced to an unrelated tab with no obvious way back. Stored in a
    // static field because only the Chromium render process was killed,
    // not this app's own Java process, so a plain static survives the
    // finish()+startActivity() below just fine.
    private static volatile String pendingRestoreUrl = null;

    private void forceHideSplashIfStuck() {
        if (splashForceHidden) return;
        splashForceHidden = true;
        WebView webView = getBridge().getWebView();
        if (webView == null) return;
        // Defensive: window.Capacitor may not exist yet if the page never
        // got far enough to load the bridge at all — guarded so this can
        // never throw even then, it just quietly does nothing in that case
        // (nothing to hide yet, nothing to break either).
        webView.evaluateJavascript(
            "(function(){try{var c=window.Capacitor;if(c&&c.Plugins&&c.Plugins.SplashScreen){c.Plugins.SplashScreen.hide();}}catch(e){}})();",
            null
        );
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Must run before super.onCreate()/setContentView(): this is what
        // actually makes the AppTheme.NoActionBarLaunch windowSplashScreen*
        // attributes (styles.xml) take effect on API < 31 — the androidx
        // compat library backports the Android 12 SplashScreen API, but
        // only once this is called. Without it, pre-12 devices never show
        // the themed splash at all and just render a blank window until
        // the WebView has something to draw, which is what was showing up
        // as a white screen at launch.
        SplashScreen.installSplashScreen(this);
        super.onCreate(savedInstanceState);

        // The actual cause of "Snap/Scan Barcode crashes and resets the
        // app": both hand off to a separate, memory-heavy full-screen
        // Activity (the system camera, or ML Kit's native scanner UI),
        // which pushes this app into the background right as Android's
        // low-memory killer is most likely to act — and what it reclaims
        // first is the WebView's own Chromium renderer process, not this
        // app's process. Android's documented default when a WebViewClient
        // does NOT override onRenderProcessGone is to crash/kill the whole
        // app the instant that happens. Capacitor's own BridgeWebViewClient
        // already calls through to any registered WebViewListener here and
        // returns whatever it reports — but with nothing registered, that
        // was always `false` ("not handled"), so Android's crash-the-app
        // default was exactly what was firing, every single time. Every
        // earlier mitigation (largeHeap, lower photo quality/width — see
        // CheckPriceExperience.tsx) only reduced how LIKELY the renderer
        // was to be reclaimed; none of them changed what happened once it
        // was, because none of them could — this is the actual handler for
        // that event, and nothing was listening for it before now.
        //
        // Per Android's own guidance, a WebView is not safe to keep using
        // once its renderer is gone — so rather than trying to resuscitate
        // this one, finish() + relaunch gives Capacitor a clean new WebView
        // from scratch. That relaunch is indistinguishable, from the JS
        // side, from the process-level reset this app's own recovery logic
        // (snapInFlightKey/scanInFlightKey in CheckPriceExperience.tsx)
        // was always written to detect and recover from gracefully — the
        // only thing missing was ever actually reaching that code instead
        // of the whole app disappearing first.
        getBridge()
            .getWebView()
            .setWebViewClient(
                new com.getcapacitor.BridgeWebViewClient(getBridge()) {
                    @Override
                    public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                        if (!detail.didCrash()) {
                            // Killed to reclaim memory, not an actual
                            // renderer crash — safe to relaunch cleanly.
                            // Remember where the person actually was so the
                            // fresh WebView can return there once it's back
                            // up, instead of silently restarting at the
                            // app's normal launch screen.
                            String currentUrl = view.getUrl();
                            if (currentUrl != null) pendingRestoreUrl = currentUrl;
                            finish();
                            startActivity(new Intent(getIntent()));
                            return true;
                        }
                        // A genuine renderer crash, not a memory reclaim —
                        // fall back to Capacitor's own default handling
                        // rather than looping a relaunch on a real bug.
                        return super.onRenderProcessGone(view, detail);
                    }

                    @Override
                    public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                        super.onReceivedError(view, request, error);
                        if (request.isForMainFrame()) {
                            forceHideSplashIfStuck();
                        }
                    }

                    @Override
                    public void onPageFinished(WebView view, String url) {
                        super.onPageFinished(view, url);
                        // Fires once for the fresh WebView's very first
                        // load (the normal server.url start page, per
                        // capacitor.config.ts) — if a render-process-gone
                        // relaunch left a page to return to, this is the
                        // one and only moment to redirect there, before the
                        // person has a chance to see or interact with the
                        // wrong screen. Cleared immediately so a normal,
                        // unrelated page load later never triggers this.
                        String restoreUrl = pendingRestoreUrl;
                        if (restoreUrl != null) {
                            pendingRestoreUrl = null;
                            if (!restoreUrl.equals(url)) view.loadUrl(restoreUrl);
                        }
                    }
                }
            );

        new Handler(Looper.getMainLooper()).postDelayed(this::forceHideSplashIfStuck, SPLASH_TIMEOUT_MS);
    }
}
