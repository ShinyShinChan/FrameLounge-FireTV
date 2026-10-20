package com.framelounge.tv;

import android.app.Activity;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import java.io.IOException;
import java.io.InputStream;
import java.util.Locale;

/** Small, dependency-free Fire OS host for the local remote-friendly web UI. */
public final class MainActivity extends Activity {
    private static final String APP_HOST = "appassets.androidplatform.net";
    private WebView webView;
    private FrameLayout root;
    private View videoFullscreenView;
    private WebChromeClient.CustomViewCallback fullscreenCallback;

    @Override
    public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.BLACK);
        getWindow().setNavigationBarColor(Color.BLACK);
        immersive();

        root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        webView = new WebView(this);
        root.addView(webView, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setJavaScriptCanOpenWindowsAutomatically(false);
        s.setSupportMultipleWindows(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setDefaultTextEncodingName("UTF-8");
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        webView.setBackgroundColor(Color.BLACK);
        webView.setFocusable(true);
        webView.setFocusableInTouchMode(true);
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return localAsset(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (!request.isForMainFrame()) return false; // FrameXTV's embedded player may navigate itself.
                Uri u = request.getUrl();
                return !"https".equalsIgnoreCase(u.getScheme()) || !APP_HOST.equalsIgnoreCase(u.getHost());
            }

            @SuppressWarnings("deprecation")
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                Uri u = Uri.parse(url);
                return !"https".equalsIgnoreCase(u.getScheme()) || !APP_HOST.equalsIgnoreCase(u.getHost());
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                if (videoFullscreenView != null) {
                    callback.onCustomViewHidden();
                    return;
                }
                videoFullscreenView = view;
                fullscreenCallback = callback;
                webView.setVisibility(View.GONE);
                root.addView(view, new FrameLayout.LayoutParams(-1, -1));
                immersive();
            }
            @Override
            public void onHideCustomView() {
                leaveNativeFullscreen();
            }
        });
        webView.loadUrl("https://" + APP_HOST + "/index.html");
        webView.requestFocus();
    }

    private WebResourceResponse localAsset(Uri uri) {
        if (!"https".equalsIgnoreCase(uri.getScheme()) || !APP_HOST.equalsIgnoreCase(uri.getHost())) return null;
        String path = uri.getPath();
        if (path == null || path.equals("/")) path = "/index.html";
        // No traversal into arbitrary APK assets.
        if (path.contains("..") || !path.matches("/[A-Za-z0-9_./-]+")) return missing();
        String name = path.substring(1);
        String mime = "text/plain";
        if (name.endsWith(".html")) mime = "text/html";
        else if (name.endsWith(".css")) mime = "text/css";
        else if (name.endsWith(".js")) mime = "application/javascript";
        else if (name.endsWith(".svg")) mime = "image/svg+xml";
        else if (name.endsWith(".png")) mime = "image/png";
        try {
            InputStream stream = getAssets().open(name);
            return new WebResourceResponse(mime, "UTF-8", stream);
        } catch (IOException ignored) {
            return missing();
        }
    }

    private WebResourceResponse missing() {
        return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", null,
                new java.io.ByteArrayInputStream(new byte[0]));
    }

    private void immersive() {
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION |
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN |
                View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
    }

    private void leaveNativeFullscreen() {
        if (videoFullscreenView == null) return;
        root.removeView(videoFullscreenView);
        videoFullscreenView = null;
        webView.setVisibility(View.VISIBLE);
        if (fullscreenCallback != null) fullscreenCallback.onCustomViewHidden();
        fullscreenCallback = null;
        immersive();
        webView.requestFocus();
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (event.getAction() == KeyEvent.ACTION_DOWN && webView != null) {
            String dpad = null;
            switch (event.getKeyCode()) {
                case KeyEvent.KEYCODE_DPAD_UP: dpad = "ArrowUp"; break;
                case KeyEvent.KEYCODE_DPAD_DOWN: dpad = "ArrowDown"; break;
                case KeyEvent.KEYCODE_DPAD_LEFT: dpad = "ArrowLeft"; break;
                case KeyEvent.KEYCODE_DPAD_RIGHT: dpad = "ArrowRight"; break;
                case KeyEvent.KEYCODE_DPAD_CENTER: dpad = "Enter"; break;
            }
            if (dpad != null) {
                webView.evaluateJavascript("window.fireTvRemoteKey && window.fireTvRemoteKey('" + dpad + "')", null);
                return true;
            }
            String action = null;
            switch (event.getKeyCode()) {
                case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE: action = "toggle"; break;
                case KeyEvent.KEYCODE_MEDIA_PLAY: action = "play"; break;
                case KeyEvent.KEYCODE_MEDIA_PAUSE: action = "pause"; break;
                case KeyEvent.KEYCODE_MEDIA_REWIND: action = "rewind"; break;
                case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD: action = "forward"; break;
            }
            if (action != null) {
                webView.evaluateJavascript("window.fireTvMediaKey && window.fireTvMediaKey('" + action + "')", null);
                return true;
            }
        }
        return super.dispatchKeyEvent(event);
    }

    @Override
    public void onBackPressed() {
        if (videoFullscreenView != null) {
            leaveNativeFullscreen();
            return;
        }
        if (webView == null) { finish(); return; }
        webView.evaluateJavascript("Boolean(window.fireTvBack && window.fireTvBack())", value -> {
            if (!"true".equals(value)) finish();
        });
    }

    @Override
    protected void onPause() {
        if (webView != null) {
            webView.evaluateJavascript("window.fireTvAppPause && window.fireTvAppPause()", null);
            webView.onPause();
        }
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        immersive();
        if (webView != null) {
            webView.onResume();
            webView.evaluateJavascript("window.fireTvAppResume && window.fireTvAppResume()", null);
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.loadUrl("about:blank");
            root.removeView(webView);
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
