package com.framelounge.tv;

import android.app.Activity;
import android.graphics.Color;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.MotionEvent;
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
    // FRAME_LOUNGE_CURSOR_MODE_V1_9: held Select+Rewind switches remote behavior.
    private CursorOverlay cursorOverlay;
    private final Handler cursorHandler = new Handler(Looper.getMainLooper());
    private boolean cursorMode = false;
    private boolean selectHeld = false;
    private boolean rewindHeld = false;
    private boolean chordUsed = false;
    private float pointerX = Float.NaN;
    private float pointerY = Float.NaN;
    private final Runnable chordAction = () -> {
        if (selectHeld && rewindHeld && !chordUsed) {
            chordUsed = true;
            setCursorMode(!cursorMode);
        }
    };
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
        cursorOverlay = new CursorOverlay();
        cursorOverlay.setVisibility(View.GONE);
        cursorOverlay.setFocusable(false);
        cursorOverlay.setClickable(false);
        root.addView(cursorOverlay, new FrameLayout.LayoutParams(-1, -1));
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
                if (cursorOverlay != null) root.bringChildToFront(cursorOverlay);
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
        else if (name.endsWith(".webp")) mime = "image/webp";
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

    private float dp(float value) {
        return value * getResources().getDisplayMetrics().density;
    }

    private void sendRemote(String key) {
        if (webView != null) webView.evaluateJavascript(
            "window.fireTvRemoteKey && window.fireTvRemoteKey('" + key + "')", null);
    }

    private void sendMedia(String action) {
        if (webView != null) webView.evaluateJavascript(
            "window.fireTvMediaKey && window.fireTvMediaKey('" + action + "')", null);
    }

    private void setCursorMode(boolean enabled) {
        cursorMode = enabled;
        if (cursorOverlay == null) return;
        if (enabled) {
            if (Float.isNaN(pointerX)) pointerX = Math.max(dp(24), cursorOverlay.getWidth() / 2f);
            if (Float.isNaN(pointerY)) pointerY = Math.max(dp(24), cursorOverlay.getHeight() / 2f);
            cursorOverlay.setVisibility(View.VISIBLE);
            root.bringChildToFront(cursorOverlay);
            cursorOverlay.invalidate();
        } else {
            cursorOverlay.setVisibility(View.GONE);
        }
        if (webView != null) webView.evaluateJavascript(
            "window.fireTvCursorModeChanged && window.fireTvCursorModeChanged(" + enabled + ")", null);
    }

    private void movePointer(KeyEvent event) {
        if (cursorOverlay == null) return;
        float speed = dp(Math.min(85, 32 + event.getRepeatCount() * 5));
        if (Float.isNaN(pointerX)) pointerX = cursorOverlay.getWidth() / 2f;
        if (Float.isNaN(pointerY)) pointerY = cursorOverlay.getHeight() / 2f;
        switch (event.getKeyCode()) {
            case KeyEvent.KEYCODE_DPAD_UP: pointerY -= speed; break;
            case KeyEvent.KEYCODE_DPAD_DOWN: pointerY += speed; break;
            case KeyEvent.KEYCODE_DPAD_LEFT: pointerX -= speed; break;
            case KeyEvent.KEYCODE_DPAD_RIGHT: pointerX += speed; break;
        }
        pointerX = Math.max(dp(8), Math.min(cursorOverlay.getWidth() - dp(8), pointerX));
        pointerY = Math.max(dp(8), Math.min(cursorOverlay.getHeight() - dp(8), pointerY));
        cursorOverlay.invalidate();
    }

    private void clickPointer() {
        // Send a *user-triggered* physical-style touch to the actual browser view.
        // Cross-origin iframe scripts cannot be controlled via parent-page JS, but
        // Android touch events can reach the point beneath this decorative overlay.
        final View target = videoFullscreenView != null ? videoFullscreenView : webView;
        if (target == null || cursorOverlay == null) return;
        final int[] at = new int[2], dest = new int[2];
        cursorOverlay.getLocationOnScreen(at);
        target.getLocationOnScreen(dest);
        final float tx = pointerX + at[0] - dest[0];
        final float ty = pointerY + at[1] - dest[1];
        if (tx < 0 || ty < 0 || tx > target.getWidth() || ty > target.getHeight()) return;
        final long time = SystemClock.uptimeMillis();
        MotionEvent down = MotionEvent.obtain(time, time, MotionEvent.ACTION_DOWN, tx, ty, 0);
        target.dispatchTouchEvent(down);
        down.recycle();
        cursorHandler.postDelayed(() -> {
            if (target.getParent() == null) return;
            MotionEvent up = MotionEvent.obtain(time, SystemClock.uptimeMillis(),
                    MotionEvent.ACTION_UP, tx, ty, 0);
            target.dispatchTouchEvent(up);
            up.recycle();
        }, 75);
    }

    private final class CursorOverlay extends View {
        private final Paint ink = new Paint(Paint.ANTI_ALIAS_FLAG);
        CursorOverlay() { super(MainActivity.this); setWillNotDraw(false); }
        @Override protected void onDraw(Canvas canvas) {
            super.onDraw(canvas);
            if (!cursorMode) return;
            float x = Float.isNaN(pointerX) ? getWidth() / 2f : pointerX;
            float y = Float.isNaN(pointerY) ? getHeight() / 2f : pointerY;
            ink.setStyle(Paint.Style.STROKE);
            ink.setStrokeWidth(dp(3));
            ink.setColor(Color.BLACK);
            canvas.drawCircle(x, y, dp(11), ink);
            canvas.drawLine(x - dp(20), y, x + dp(20), y, ink);
            canvas.drawLine(x, y - dp(20), x, y + dp(20), ink);
            ink.setStrokeWidth(dp(1.8f));
            ink.setColor(Color.WHITE);
            canvas.drawCircle(x, y, dp(11), ink);
            canvas.drawLine(x - dp(20), y, x + dp(20), y, ink);
            canvas.drawLine(x, y - dp(20), x, y + dp(20), ink);
            ink.setStyle(Paint.Style.FILL);
            ink.setColor(Color.rgb(175, 140, 255));
            canvas.drawCircle(x, y, dp(3), ink);
            ink.setColor(Color.WHITE);
            ink.setTextSize(dp(13));
            canvas.drawText("CURSOR  |  SELECT = CLICK  |  HOLD SELECT + REWIND = D-PAD", dp(16), dp(28), ink);
        }
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        final int code = event.getKeyCode();
        final boolean down = event.getAction() == KeyEvent.ACTION_DOWN;
        final boolean up = event.getAction() == KeyEvent.ACTION_UP;
        if (code == KeyEvent.KEYCODE_DPAD_CENTER || code == KeyEvent.KEYCODE_ENTER) {
            if (down) {
                if (!selectHeld) selectHeld = true;
                if (rewindHeld && !chordUsed) {
                    cursorHandler.removeCallbacks(chordAction);
                    cursorHandler.postDelayed(chordAction, 330);
                }
            } else if (up) {
                final boolean skip = chordUsed;
                selectHeld = false;
                cursorHandler.removeCallbacks(chordAction);
                if (!rewindHeld) chordUsed = false;
                if (!skip) {
                    if (cursorMode) clickPointer(); else sendRemote("Enter");
                }
            }
            return true;
        }
        if (code == KeyEvent.KEYCODE_MEDIA_REWIND) {
            if (down) {
                if (!rewindHeld) rewindHeld = true;
                if (selectHeld && !chordUsed) {
                    cursorHandler.removeCallbacks(chordAction);
                    cursorHandler.postDelayed(chordAction, 330);
                }
            } else if (up) {
                final boolean skip = chordUsed;
                rewindHeld = false;
                cursorHandler.removeCallbacks(chordAction);
                if (!selectHeld) chordUsed = false;
                if (!skip) sendMedia("rewind");
            }
            return true;
        }
        if (down && (code == KeyEvent.KEYCODE_DPAD_UP || code == KeyEvent.KEYCODE_DPAD_DOWN ||
                     code == KeyEvent.KEYCODE_DPAD_LEFT || code == KeyEvent.KEYCODE_DPAD_RIGHT)) {
            if (cursorMode) movePointer(event);
            else {
                String key = code == KeyEvent.KEYCODE_DPAD_UP ? "ArrowUp" :
                             code == KeyEvent.KEYCODE_DPAD_DOWN ? "ArrowDown" :
                             code == KeyEvent.KEYCODE_DPAD_LEFT ? "ArrowLeft" : "ArrowRight";
                sendRemote(key);
            }
            return true;
        }
        if (up && (code == KeyEvent.KEYCODE_DPAD_UP || code == KeyEvent.KEYCODE_DPAD_DOWN ||
                   code == KeyEvent.KEYCODE_DPAD_LEFT || code == KeyEvent.KEYCODE_DPAD_RIGHT)) return true;
        if (down) {
            switch (code) {
                case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE: sendMedia("toggle"); return true;
                case KeyEvent.KEYCODE_MEDIA_PLAY: sendMedia("play"); return true;
                case KeyEvent.KEYCODE_MEDIA_PAUSE: sendMedia("pause"); return true;
                case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD: sendMedia("forward"); return true;
            }
        }
        return super.dispatchKeyEvent(event);
    }

    @Override
    public void onBackPressed() {
        if (cursorMode) {
            setCursorMode(false);
            return;
        }
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
        cursorHandler.removeCallbacksAndMessages(null);
        if (webView != null) {
            webView.loadUrl("about:blank");
            root.removeView(webView);
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
