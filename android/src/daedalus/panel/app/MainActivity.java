package daedalus.panel.app;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.nsd.NsdManager;
import android.net.nsd.NsdServiceInfo;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.Log;
import android.view.View;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;
import org.json.JSONObject;

import java.net.Inet4Address;
import java.net.InetAddress;

/**
 * One full-screen web view showing the bundled UI, plus a small JS to native bridge. The same structure as the
 * iPad app (Sources/App.swift).
 * JS calls:       DaedalusNative.post(JSON.stringify({id, cmd, ...}))
 * Native answers: window.nativeReply({id, ...})
 */
public class MainActivity extends Activity {
    static final String TAG = "Daedalus";
    static final String SERVICE = "_daedalus._tcp";
    WebView web;
    final Handler main = new Handler(Looper.getMainLooper());
    PermissionRequest waiting;  // the page's request for the microphone, while the person is being asked

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);  // a wall panel: never sleep while the app is in front
        keepServer(getIntent());

        web = new WebView(this);
        web.setBackgroundColor(Color.BLACK);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);  // the design and the engine from Daedalus Workshop are kept here
        s.setAllowFileAccess(true);    // the UI is the app's own files
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        web.addJavascriptInterface(new Bridge(), "DaedalusNative");
        web.setWebViewClient(new WebViewClient());  // the page moves between its own files; without this each move is handed to the system and refused
        web.setWebChromeClient(new WebChromeClient() {
            // Console output goes to the device log, to be read with adb logcat -s Daedalus.
            @Override
            public boolean onConsoleMessage(ConsoleMessage m) {
                Log.i(TAG, "[web " + m.messageLevel() + "] " + m.message());
                return true;
            }

            // The assistant button asks for the microphone. Android asks the person once; after that the page is
            // not asked again on every tap.
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                    request.grant(request.getResources());
                } else {
                    waiting = request;
                    requestPermissions(new String[] {Manifest.permission.RECORD_AUDIO}, 1);
                }
            }
        });
        setContentView(web);
        web.loadUrl("file:///android_asset/web/index.html");
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] names, int[] results) {
        if (waiting == null) return;
        if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) waiting.grant(waiting.getResources());
        else waiting.deny();
        waiting = null;
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (keepServer(intent)) web.reload();
    }

    /** Where mDNS does not reach, the address of Daedalus Workshop can be given once at launch:
     *  adb shell am start -n daedalus.panel.app/.MainActivity --es server http://ADDRESS:8722   (--es server "" forgets it) */
    boolean keepServer(Intent intent) {
        String v = intent == null ? null : intent.getStringExtra("server");
        if (v == null) return false;
        getPreferences(MODE_PRIVATE).edit().putString("server", v.trim()).apply();
        return true;
    }

    @Override
    public void onWindowFocusChanged(boolean has) {
        super.onWindowFocusChanged(has);
        if (has) web.setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
    }

    /** Back closes what is open on the page (a question, a room). With nothing open the app steps aside. */
    @Override
    public void onBackPressed() {
        web.evaluateJavascript("window.HP && HP.remoteBack ? HP.remoteBack() : false", v -> {
            if (!"true".equals(v)) moveTaskToBack(true);
        });
    }

    @Override
    protected void onResume() { super.onResume(); web.onResume(); }

    @Override
    protected void onPause() { web.onPause(); super.onPause(); }

    void reply(JSONObject out) {
        final String js = "window.nativeReply && window.nativeReply(" + out + ")";
        main.post(() -> web.evaluateJavascript(js, null));
    }

    class Bridge {
        @JavascriptInterface
        public void post(String json) {
            try {
                final JSONObject m = new JSONObject(json), out = new JSONObject();
                String cmd = m.optString("cmd");
                out.put("id", m.opt("id")).put("cmd", cmd);
                switch (cmd) {
                    case "ping": main.post(() -> ping(out)); return;  // the view's size is read on its own thread
                    case "discover": discover(out); return;
                    case "motion": break;  // no depth effect: a television does not tilt
                    case "mic": out.put("error", "no native microphone"); break;  // the page uses the web view's own
                    case "micstat": out.put("on", false); break;
                    case "brightness": out.put("brightness", 1); break;
                    default: out.put("error", "unknown cmd");
                }
                reply(out);
            } catch (Exception e) {
                Log.e(TAG, "bridge: " + e);
            }
        }
    }

    void ping(JSONObject out) {
        try {
            float d = getResources().getDisplayMetrics().density;
            String name = Settings.Global.getString(getContentResolver(), "device_name");
            JSONObject cfg = new JSONObject();
            String server = getPreferences(MODE_PRIVATE).getString("server", "");
            if (!server.isEmpty()) cfg.put("server", server);
            // width and height in the page's own pixels: what a design is laid out for
            out.put("model", Build.MODEL).put("os", Build.VERSION.RELEASE).put("brightness", 1).put("config", cfg);
            out.put("device", new JSONObject()
                    .put("id", Settings.Secure.getString(getContentResolver(), Settings.Secure.ANDROID_ID))
                    .put("model", Build.MANUFACTURER + " " + Build.MODEL)
                    .put("name", name == null || name.isEmpty() ? Build.MODEL : name)
                    .put("width", Math.round(web.getWidth() / d)).put("height", Math.round(web.getHeight() / d))
                    .put("scale", d));
        } catch (Exception e) {
            Log.e(TAG, "ping: " + e);
        }
        reply(out);
    }

    /** Look for Daedalus Workshop on the network; answers after a short listen, with whatever was found. */
    void discover(final JSONObject out) {
        final NsdManager nsd = (NsdManager) getSystemService(NSD_SERVICE);
        final JSONArray found = new JSONArray();
        final NsdManager.DiscoveryListener listen = new NsdManager.DiscoveryListener() {
            public void onServiceFound(NsdServiceInfo info) {
                try {
                    nsd.resolveService(info, new NsdManager.ResolveListener() {
                        public void onServiceResolved(NsdServiceInfo r) {
                            InetAddress a = r.getHost();
                            if (!(a instanceof Inet4Address)) return;
                            try {
                                synchronized (found) {
                                    found.put(new JSONObject().put("name", r.getServiceName()).put("host", a.getHostAddress()).put("port", r.getPort()));
                                }
                            } catch (Exception e) { Log.e(TAG, "resolve: " + e); }
                        }
                        public void onResolveFailed(NsdServiceInfo r, int code) { Log.i(TAG, "resolve failed " + code); }
                    });
                } catch (Exception e) { Log.e(TAG, "resolve: " + e); }
            }
            public void onServiceLost(NsdServiceInfo info) { }
            public void onDiscoveryStarted(String type) { }
            public void onDiscoveryStopped(String type) { }
            public void onStartDiscoveryFailed(String type, int code) { Log.i(TAG, "discovery failed " + code); }
            public void onStopDiscoveryFailed(String type, int code) { }
        };
        try { nsd.discoverServices(SERVICE, NsdManager.PROTOCOL_DNS_SD, listen); } catch (Exception e) { Log.e(TAG, "discover: " + e); }
        main.postDelayed(() -> {
            try { nsd.stopServiceDiscovery(listen); } catch (Exception e) { /* it never started */ }
            try { synchronized (found) { out.put("servers", found); } } catch (Exception e) { Log.e(TAG, "discover: " + e); }
            reply(out);
        }, 2500);
    }
}
