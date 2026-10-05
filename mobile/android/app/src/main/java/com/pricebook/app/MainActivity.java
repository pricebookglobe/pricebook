package com.pricebook.app;

import android.content.Intent;
import android.os.Bundle;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
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
                            finish();
                            startActivity(new Intent(getIntent()));
                            return true;
                        }
                        // A genuine renderer crash, not a memory reclaim —
                        // fall back to Capacitor's own default handling
                        // rather than looping a relaunch on a real bug.
                        return super.onRenderProcessGone(view, detail);
                    }
                }
            );
    }
}
