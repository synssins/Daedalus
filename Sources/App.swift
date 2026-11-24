import AVFoundation
import CoreMotion
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
class PanelViewController: UIViewController, WKScriptMessageHandler, WKUIDelegate {
    var web: WKWebView!
    let discovery = Discovery()
    let motion = CMMotionManager()
    let audio = AVAudioEngine()
    var micOn = false
    // Counters for "micstat": where sound stops, when it does not reach the page.
    var micTaps = 0, micFrames = 0, micSent = 0
    var micNote = ""

    /// Hardware identifier such as "iPad5,3".
    func machine() -> String {
        var s = utsname()
        uname(&s)
        return withUnsafePointer(to: &s.machine) { $0.withMemoryRebound(to: CChar.self, capacity: 1) { String(cString: $0) } }
    }

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
        web.uiDelegate = self
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
            out["device"] = ["id": UIDevice.current.identifierForVendor?.uuidString ?? "unknown", "model": machine(),
                             "name": UIDevice.current.name, "width": Int(view.bounds.width), "height": Int(view.bounds.height),
                             "scale": Double(UIScreen.main.scale)]
        case "discover":
            // Look for HomePanel Studio on the network; answers after a short listen, with whatever was found.
            discovery.find(seconds: 2.5) { servers in
                out["servers"] = servers
                self.reply(out)
            }
            return
        case "motion":
            // The depth effect: send the direction of gravity across the screen about 20 times a second.
            // The page calls window.nativeMotion(x, y) with values in -1...1 along the screen's own axes.
            motion.stopDeviceMotionUpdates()
            if (m["on"] as? Bool) == true && motion.isDeviceMotionAvailable {
                motion.deviceMotionUpdateInterval = 1.0 / 20.0
                motion.startDeviceMotionUpdates(to: .main) { [weak self] data, _ in
                    guard let self = self, let g = data?.gravity else { return }
                    // Gravity is reported for an upright (portrait) device; turn it to match how the screen is held.
                    var x = g.x, y = -g.y
                    switch self.view.window?.windowScene?.interfaceOrientation {
                    case .landscapeRight?: x = -g.y; y = -g.x
                    case .landscapeLeft?: x = g.y; y = g.x
                    case .portraitUpsideDown?: x = -g.x; y = g.y
                    default: break
                    }
                    self.web.evaluateJavaScript(String(format: "window.nativeMotion && window.nativeMotion(%.3f,%.3f)", x, y), completionHandler: nil)
                }
            }
        case "mic":
            // The microphone for the wake word and the assistant. Sound goes to the page (window.nativeAudio) and
            // nowhere else; the page decides what, if anything, is sent on. iOS asks the person once.
            if (m["on"] as? Bool) != true { stopMic(); out["on"] = false; break }
            AVAudioSession.sharedInstance().requestRecordPermission { granted in
                DispatchQueue.main.async {
                    if !granted { out["error"] = "denied" } else {
                        do { try self.startMic(); out["on"] = true } catch { out["error"] = "microphone: \(error.localizedDescription)" }
                    }
                    self.reply(out)
                }
            }
            return
        case "micstat":
            out["on"] = micOn; out["taps"] = micTaps; out["frames"] = micFrames; out["sent"] = micSent; out["note"] = micNote
            out["running"] = audio.isRunning
            out["permission"] = AVAudioSession.sharedInstance().recordPermission == .granted
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

    /// Capture at whatever rate the hardware gives, convert to 16 kHz 16-bit mono, hand each piece to the page as base64.
    func startMic() throws {
        if micOn { return }
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetooth])
        try session.setActive(true)
        let input = audio.inputNode
        let inFormat = input.outputFormat(forBus: 0)
        micNote = "input \(Int(inFormat.sampleRate)) Hz, \(inFormat.channelCount) ch"
        micTaps = 0; micFrames = 0; micSent = 0
        guard let outFormat = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: 16000, channels: 1, interleaved: true),
              let converter = AVAudioConverter(from: inFormat, to: outFormat) else {
            throw NSError(domain: "HomePanel", code: 1, userInfo: [NSLocalizedDescriptionKey: "no usable input format"])
        }
        input.installTap(onBus: 0, bufferSize: 4096, format: inFormat) { [weak self] buffer, _ in
            self?.micTaps += 1
            let capacity = AVAudioFrameCount(Double(buffer.frameLength) * 16000.0 / inFormat.sampleRate) + 32
            guard let out = AVAudioPCMBuffer(pcmFormat: outFormat, frameCapacity: capacity) else { return }
            var fed = false
            var failure: NSError?
            converter.convert(to: out, error: &failure) { _, status in
                if fed { status.pointee = .noDataNow; return nil }
                fed = true
                status.pointee = .haveData
                return buffer
            }
            if let failure = failure { self?.micNote = "convert: \(failure.localizedDescription)"; return }
            guard out.frameLength > 0, let samples = out.int16ChannelData else { return }
            self?.micFrames += Int(out.frameLength)
            let b64 = Data(bytes: samples[0], count: Int(out.frameLength) * 2).base64EncodedString()
            DispatchQueue.main.async {
                self?.micSent += 1
                self?.web.evaluateJavaScript("window.nativeAudio && window.nativeAudio('\(b64)')") { _, err in
                    if let err = err { self?.micNote = "page: \(err.localizedDescription)" }
                }
            }
        }
        audio.prepare()
        try audio.start()
        micOn = true
    }

    func stopMic() {
        guard micOn else { return }
        audio.inputNode.removeTap(onBus: 0)
        audio.stop()
        micOn = false
    }

    /// The assistant button asks for the microphone. iOS asks the person once (its own prompt); after that the
    /// page must not ask again on every tap, so the web view's own question is answered here.
    @available(iOS 15.0, *)
    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo,
                 type: WKMediaCaptureType, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        decisionHandler(.grant)
    }

    func reply(_ obj: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: obj),
              let json = String(data: data, encoding: .utf8) else { return }
        web.evaluateJavaScript("window.nativeReply && window.nativeReply(\(json))", completionHandler: nil)
    }
}

/// Finds HomePanel Studio servers advertised over mDNS as _homepanel._tcp.
final class Discovery: NSObject, NetServiceBrowserDelegate, NetServiceDelegate {
    private let browser = NetServiceBrowser()
    private var services: [NetService] = []   // must be kept alive while they resolve
    private var found: [[String: Any]] = []

    func find(seconds: Double, done: @escaping ([[String: Any]]) -> Void) {
        services = []
        found = []
        browser.delegate = self
        browser.searchForServices(ofType: "_homepanel._tcp.", inDomain: "local.")
        DispatchQueue.main.asyncAfter(deadline: .now() + seconds) {
            self.browser.stop()
            done(self.found)
        }
    }

    func netServiceBrowser(_ browser: NetServiceBrowser, didFind service: NetService, moreComing: Bool) {
        services.append(service)
        service.delegate = self
        service.resolve(withTimeout: 2)
    }

    func netServiceDidResolveAddress(_ sender: NetService) {
        for data in sender.addresses ?? [] {
            let host: String? = data.withUnsafeBytes { raw -> String? in
                guard let sa = raw.baseAddress?.assumingMemoryBound(to: sockaddr.self),
                      sa.pointee.sa_family == sa_family_t(AF_INET) else { return nil }
                var buf = [CChar](repeating: 0, count: Int(NI_MAXHOST))
                guard getnameinfo(sa, socklen_t(data.count), &buf, socklen_t(buf.count), nil, 0, NI_NUMERICHOST) == 0 else { return nil }
                return String(cString: buf)
            }
            if let h = host {
                found.append(["name": sender.name, "host": h, "port": sender.port])
                break
            }
        }
    }
}