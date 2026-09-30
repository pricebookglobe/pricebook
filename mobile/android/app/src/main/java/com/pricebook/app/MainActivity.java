package com.pricebook.app;

import android.os.Bundle;
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
    }
}
