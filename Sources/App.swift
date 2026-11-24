import UIKit
import WebKit

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        let w = UIWindow(frame: UIScreen.main.bounds)
        w.rootViewController = PanelViewController()
        w.makeKeyAndVisible()
        window = w
        application.isIdleTimerDisabled = true  // wall panel: never sleep while the app is in front
        return true
    }
}

/// One full-screen web view showing the bundled UI, plus a small JS <-> native bridge.
/// JS calls:   window.webkit.messageHandlers.native.postMessage({id, cmd, ...})
/// Native answers: window.nativeReply({id, ...})
class PanelViewController: UIViewController, WKScriptMessageHandler {
    var web: WKWebView!

    override var prefersStatusBarHidden: Bool { true }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black

        let cfg = WKWebViewConfiguration()
        cfg.allowsInlineMediaPlayback = true
        cfg.mediaTypesRequiringUserActionForPlayback = []
        cfg.userContentController.add(self, name: "native")
        // Send console output to the device log so it can be read over USB.
        let hook = """
        for (const k of ['log','warn','error']) { const o = console[k]; console[k] = (...a) => {
          try { window.webkit.messageHandlers.native.postMessage({cmd:'log', level:k, text:a.map(String).join(' ')}); } catch (e) {}
          o.apply(console, a); }; }
        window.addEventListener('error', e => console.error('JS error: ' + e.message + ' @' + e.lineno));
        """
        cfg.userContentController.addUserScript(
            WKUserScript(source: hook, injectionTime: .atDocumentStart, forMainFrameOnly: true))

        web = WKWebView(frame: view.bounds, configuration: cfg)
        web.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        web.isOpaque = false
        web.backgroundColor = .black
        web.scrollView.bounces = false
        web.scrollView.contentInsetAdjustmentBehavior = .never
        view.addSubview(web)

        guard let dir = Bundle.main.resourceURL?.appendingPathComponent("web") else { return }
        web.loadFileURL(dir.appendingPathComponent("index.html"), allowingReadAccessTo: dir)
    }

    func userContentController(_ ucc: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let m = message.body as? [String: Any], let cmd = m["cmd"] as? String else { return }
        var out: [String: Any] = ["id": m["id"] ?? NSNull(), "cmd": cmd]
        switch cmd {
        case "log":
            NSLog("[HomePanel web %@] %@", (m["level"] as? String) ?? "log", (m["text"] as? String) ?? "")
            return
        case "ping":
            out["model"] = UIDevice.current.model
            out["os"] = UIDevice.current.systemVersion
            out["brightness"] = Double(UIScreen.main.brightness)
            out["config"] = loadConfig()
        case "brightness":
            if let v = m["value"] as? Double { UIScreen.main.brightness = CGFloat(max(0, min(1, v))) }
            out["brightness"] = Double(UIScreen.main.brightness)
        default:
            out["error"] = "unknown cmd"
        }
        reply(out)
    }

    /// Per-iPad settings (HA address, token, room) live in config.json next to the app binary,
    /// pushed over SSH at install time and never committed.
    func loadConfig() -> Any {
        guard let url = Bundle.main.resourceURL?.appendingPathComponent("config.json"),
              let data = try? Data(contentsOf: url),
              let obj = try? JSONSerialization.jsonObject(with: data) else { return [String: Any]() }
        return obj
    }

    func reply(_ obj: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: obj),
              let json = String(data: data, encoding: .utf8) else { return }
        web.evaluateJavaScript("window.nativeReply && window.nativeReply(\(json))", completionHandler: nil)
    }
}
