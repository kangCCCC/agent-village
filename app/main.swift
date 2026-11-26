// 에이전트빌리지 — 맥 앱 껍데기.
// 켜면 앱 안에 든 마을 서버(server.py)를 몰래 띄우고, 창 하나에 마을 화면을 보여 준다.
// 끄면 서버도 같이 끈다. 사장님은 파이썬 명령을 칠 일이 없다.
import AppKit
import WebKit

let PORT = 8791
let DATA = NSHomeDirectory() + "/Documents/agent-village/data"   // 우체부 모드와 함께 쓰는 자리

// 화면 언어: 마을 설정(settings.json 의 lang)이 en 이면 영어 (11-26)
func L(_ ko: String, _ en: String) -> String {
    if let d = FileManager.default.contents(atPath: DATA + "/settings.json"),
       let j = try? JSONSerialization.jsonObject(with: d) as? [String: Any], (j["lang"] as? String) == "en" { return en }
    return ko
}

final class AppDelegate: NSObject, NSApplicationDelegate, WKUIDelegate, WKNavigationDelegate, WKScriptMessageHandler {
    var window: NSWindow!
    var recorder: AnyObject?      // VillageRecorder (맥OS 15 이상)
    var web: WKWebView!
    var server: Process?

    func applicationDidFinishLaunching(_ n: Notification) {
        buildMenu()
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1280, height: 820),
                          styleMask: [.titled, .closable, .miniaturizable, .resizable],
                          backing: .buffered, defer: false)
        window.title = L("에이전트빌리지", "Agent Village")
        window.setFrameAutosaveName("VillageWindow")
        window.isReleasedWhenClosed = false
        window.center()
        let cfg = WKWebViewConfiguration()
        cfg.userContentController.add(self, name: "rec")     // 화면의 「⏺ 마을 녹화」 단추
        web = WKWebView(frame: .zero, configuration: cfg)
        web.uiDelegate = self
        web.navigationDelegate = self
        window.contentView = web
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        web.loadHTMLString(waitingPage(L("마을을 깨우는 중…", "Waking up the village…")), baseURL: nil)
        startServer()
        waitThenLoad(tries: 0)
        startHealthWatch()
    }

    // ---- 마을 서버 지키기 (11-26) ----
    // 예전엔 서버가 죽어도 앱 창은 멀쩡히 떠 있어서, 피클 편지 전달·이웃 동기화가 아무도 모르게 1시간 넘게 멈췄다.
    // 이제 ① 서버가 끝나면 까닭을 로그에 적고 3초 뒤 다시 띄운다 ② 살아 있어도 2분 넘게 대답이 없으면 끄고 다시 띄운다.
    var quitting = false
    var restarts: [Date] = []
    var healthFails = 0
    let logPath = NSHomeDirectory() + "/Library/Logs/AgentVillage.log"

    func logLine(_ msg: String) {
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd HH:mm:ss"
        let line = "[앱 \(f.string(from: Date()))] \(msg)\n"
        if let h = FileHandle(forWritingAtPath: logPath) { h.seekToEndOfFile(); h.write(line.data(using: .utf8)!); try? h.close() }
    }

    func startServer() {
        guard let res = Bundle.main.resourcePath else { return }
        let py = ["/opt/homebrew/bin/python3", "/usr/local/bin/python3", "/usr/bin/python3"]
            .first { FileManager.default.isExecutableFile(atPath: $0) } ?? "/usr/bin/python3"
        try? FileManager.default.createDirectory(atPath: DATA + "/receipts", withIntermediateDirectories: true)
        let p = Process()
        p.executableURL = URL(fileURLWithPath: py)
        p.arguments = ["-u", res + "/server.py"]      // -u: 출력을 쌓아 두지 않고 바로 로그에 쓴다 (죽기 직전 말이 남게)
        p.currentDirectoryURL = URL(fileURLWithPath: res)
        var env = ProcessInfo.processInfo.environment
        env["VILLAGE_PORT"] = String(PORT)
        env["VILLAGE_DATA"] = DATA
        // 문은 서버가 설정을 보고 정한다: 「📱 폰으로 보기」에서 켜야만 같은 와이파이에 열림 (기본은 이 맥 안에서만, 11-26 보안 검수)
        env["PYTHONUNBUFFERED"] = "1"
        p.environment = env
        // 로그는 지우지 않고 이어 쓴다. 5MB 넘으면 .1 로 돌린다 (예전엔 켤 때마다 비워서 죽은 까닭이 사라졌다)
        let fm = FileManager.default
        if let sz = (try? fm.attributesOfItem(atPath: logPath))?[.size] as? Int, sz > 5_000_000 {
            try? fm.removeItem(atPath: logPath + ".1"); try? fm.moveItem(atPath: logPath, toPath: logPath + ".1")
        }
        if !fm.fileExists(atPath: logPath) { fm.createFile(atPath: logPath, contents: nil) }
        logLine("마을 서버를 띄웁니다")
        if let h = FileHandle(forWritingAtPath: logPath) { h.seekToEndOfFile(); p.standardOutput = h; p.standardError = h }
        p.terminationHandler = { [weak self] proc in
            DispatchQueue.main.async { self?.serverEnded(proc) }
        }
        do { try p.run(); server = p; healthFails = 0 } catch {
            logLine("마을 서버를 못 띄움: \(error.localizedDescription)")
            web.loadHTMLString(waitingPage(L("마을 서버를 못 띄웠습니다: ", "Could not start the village server: ") + error.localizedDescription), baseURL: nil)
        }
    }

    func serverEnded(_ p: Process) {
        guard p === server else { return }
        server = nil
        if quitting { return }
        let why = p.terminationReason == .uncaughtSignal ? "신호 \(p.terminationStatus)번으로 끊김(누가 껐거나 강제 종료)" : "종료 코드 \(p.terminationStatus)"
        logLine("마을 서버가 끝났습니다: \(why)")
        let now = Date()
        restarts = restarts.filter { now.timeIntervalSince($0) < 600 } + [now]
        if restarts.count > 5 {
            logLine("10분 안에 5번 넘게 죽어서 다시 띄우기를 멈춥니다")
            web.loadHTMLString(waitingPage(L("마을 서버가 계속 죽습니다. ~/Library/Logs/AgentVillage.log 를 보세요. (앱을 다시 켜면 다시 시도합니다)", "The village server keeps crashing. See ~/Library/Logs/AgentVillage.log (relaunch the app to try again).")), baseURL: nil)
            return
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 3) { [weak self] in
            guard let self = self, !self.quitting, self.server == nil else { return }
            self.logLine("마을 서버를 다시 띄웁니다 (\(self.restarts.count)번째)")
            self.startServer()
            self.waitThenLoad(tries: 0)
        }
    }

    // 30초마다 서버에 물어본다. 4번 연속(2분) 대답이 없으면 멈춘 것으로 보고 끈다 → 위 serverEnded 가 다시 띄운다
    func startHealthWatch() {
        Timer.scheduledTimer(withTimeInterval: 30, repeats: true) { [weak self] _ in
            guard let self = self, !self.quitting else { return }
            guard let p = self.server, p.isRunning else {
                if self.server == nil && self.restarts.count <= 5 { return }   // 다시 띄우는 중이거나 포기한 상태
                return
            }
            var req = URLRequest(url: URL(string: "http://127.0.0.1:\(PORT)/api/agents")!)
            req.timeoutInterval = 20
            URLSession.shared.dataTask(with: req) { _, resp, _ in
                DispatchQueue.main.async {
                    if (resp as? HTTPURLResponse)?.statusCode == 200 { self.healthFails = 0; return }
                    self.healthFails += 1
                    self.logLine("마을 서버가 대답이 없습니다 (\(self.healthFails)/4)")
                    if self.healthFails >= 4, let s = self.server, s.isRunning {
                        self.logLine("2분 넘게 대답이 없어 끄고 다시 띄웁니다")
                        self.healthFails = 0
                        s.terminate()
                        DispatchQueue.main.asyncAfter(deadline: .now() + 5) { if s.isRunning { kill(s.processIdentifier, SIGKILL) } }
                    }
                }
            }.resume()
        }
    }

    func waitThenLoad(tries: Int) {
        let url = URL(string: "http://127.0.0.1:\(PORT)/api/agents")!
        URLSession.shared.dataTask(with: url) { _, resp, _ in
            DispatchQueue.main.async {
                if (resp as? HTTPURLResponse)?.statusCode == 200 {
                    self.web.load(URLRequest(url: URL(string: "http://127.0.0.1:\(PORT)/")!))
                } else if tries < 40 {
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { self.waitThenLoad(tries: tries + 1) }
                } else {
                    self.web.loadHTMLString(self.waitingPage(L("마을 서버가 응답하지 않습니다. ~/Library/Logs/AgentVillage.log 를 보세요.", "The village server is not responding. See ~/Library/Logs/AgentVillage.log.")), baseURL: nil)
                }
            }
        }.resume()
    }

    func waitingPage(_ msg: String) -> String {
        "<html><body style='background:#1d1a2b;color:#fff8ea;font-family:-apple-system;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-size:20px'>\(msg)</body></html>"
    }

    func buildMenu() {
        let main = NSMenu()
        let appItem = NSMenuItem(); main.addItem(appItem)
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: L("새로 고침", "Reload"), action: #selector(reload), keyEquivalent: "r")
        let rec = NSMenuItem(title: L("마을 녹화 시작·멈춤", "Start/stop village recording"), action: #selector(toggleRecord), keyEquivalent: "r")
        rec.keyEquivalentModifierMask = [.command, .shift]
        appMenu.addItem(rec)
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: L("에이전트빌리지 끝내기", "Quit Agent Village"), action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu
        // 글자 칸에서 복사·붙여넣기가 되게 편집 메뉴를 단다
        let editItem = NSMenuItem(); main.addItem(editItem)
        let edit = NSMenu(title: L("편집", "Edit"))
        edit.addItem(withTitle: L("실행 취소", "Undo"), action: Selector(("undo:")), keyEquivalent: "z")
        edit.addItem(withTitle: L("잘라내기", "Cut"), action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        edit.addItem(withTitle: L("복사", "Copy"), action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        edit.addItem(withTitle: L("붙여넣기", "Paste"), action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        edit.addItem(withTitle: L("모두 선택", "Select All"), action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editItem.submenu = edit
        NSApp.mainMenu = main
    }

    @objc func reload() { web.reload() }

    // ---- 마을 녹화: 창 화면 + 맥 마이크 + 마을 소리를 한 파일로 ----
    func userContentController(_ c: WKUserContentController, didReceive m: WKScriptMessage) {
        // 녹화 단추는 마을 화면 본문에서만 (유튜브 같은 끼워 넣은 화면이 녹화를 켜지 못하게 — 11-26 3차 검수)
        guard m.frameInfo.isMainFrame, let h = m.frameInfo.request.url?.host, h == "127.0.0.1" || h == "localhost" else { return }
        if m.name == "rec" { toggleRecord() }
    }

    @objc func toggleRecord() {
        guard #available(macOS 15.0, *) else { recState("error", "마을 녹화는 맥OS 15 이상에서 됩니다"); return }
        let r: VillageRecorder
        if let x = recorder as? VillageRecorder { r = x } else {
            r = VillageRecorder()
            r.onState = { [weak self] st, msg in self?.recState(st, msg) }
            recorder = r
        }
        if r.isRecording { recState("saving", "저장하는 중…"); r.stop() } else { recState("starting", "녹화 준비 중…"); r.start(window: window) }
    }

    func recState(_ st: String, _ msg: String) {
        let js = "window.recState && window.recState(\(jsStr(st)), \(jsStr(msg)))"
        web.evaluateJavaScript(js, completionHandler: nil)
    }

    func jsStr(_ s: String) -> String {
        let d = try? JSONSerialization.data(withJSONObject: [s])
        let a = d.flatMap { String(data: $0, encoding: .utf8) } ?? "[\"\"]"
        return String(a.dropFirst().dropLast())
    }

    // claude:// 처럼 웹이 아닌 주소는 맥에 넘겨 클로드 앱 등이 열게 한다
    func webView(_ w: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        // 마을 창 자체가 data: 주소로 넘어가지 못하게 (그림 data: 는 창 이동이 아니라 상관없다)
        if action.targetFrame?.isMainFrame == true, let sc = action.request.url?.scheme, sc == "data" {
            decisionHandler(.cancel); return
        }
        // 마을 창 자체는 마을 주소에만 머문다. 다른 웹 주소로 가려 하면 창은 그대로 두고 기본 브라우저로 연다 (11-26 3차 검수)
        if action.targetFrame?.isMainFrame == true, let url = action.request.url, let sc = url.scheme, ["http", "https"].contains(sc),
           !((url.host == "127.0.0.1" || url.host == "localhost") && url.port == PORT) {
            if action.navigationType == .linkActivated { NSWorkspace.shared.open(url) } else { logLine("창 이동 막음: \(url.host ?? "?")") }
            decisionHandler(.cancel); return
        }
        if let url = action.request.url, let sc = url.scheme, !["http", "https", "about", "data", "blob"].contains(sc) {
            // 맥에 넘기는 건 클로드 앱 주소(claude://)만 — file:// 등으로 맥 프로그램을 몰래 실행하지 못하게 (11-26 보안 검수)
            if sc == "claude" { NSWorkspace.shared.open(url) } else { logLine("열지 않은 주소: \(sc)://…") }
            decisionHandler(.cancel); return
        }
        decisionHandler(.allow)
    }

    // 새 탭 링크(target=_blank): 세션이 보낸 맥 파일은 맥 앱(미리보기·퀵타임 등)으로, 웹 주소는 기본 브라우저로 연다
    func webView(_ w: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        guard let url = action.request.url else { return nil }
        if (url.host == "127.0.0.1" || url.host == "localhost"), url.port == PORT, url.path == "/api/file",
           let p = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "path" })?.value,
           FileManager.default.fileExists(atPath: p) {
            // 서버에 먼저 물어 「세션이 보낸 파일」일 때만 연다 (화면에 끼어든 글이 아무 맥 파일이나 열지 못하게 — 11-26 3차 검수)
            var rq = URLRequest(url: url); rq.setValue("bytes=0-0", forHTTPHeaderField: "Range"); rq.timeoutInterval = 10
            URLSession.shared.dataTask(with: rq) { _, resp, _ in
                let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
                DispatchQueue.main.async {
                    guard code == 200 || code == 206 else { self.logLine("열지 않은 파일(세션이 보낸 파일 아님)"); return }
                    // 문서·그림·소리·영상만 맥 앱으로 바로 열고, 그 밖(.app .command .sh 등 실행될 수 있는 것)은 파인더에서 보여 주기만 한다
                    let safe = ["png","jpg","jpeg","gif","webp","heic","pdf","txt","md","srt","csv","tsv","json","mp3","m4a","wav","mp4","mov","m4v","webm","docx","xlsx","pptx","hwp","hwpx","prproj","psd","ai","key","pages","numbers"]
                    let u = URL(fileURLWithPath: p)
                    if safe.contains(u.pathExtension.lowercased()) { NSWorkspace.shared.open(u) }
                    else { NSWorkspace.shared.activateFileViewerSelecting([u]) }
                }
            }.resume()
        } else if let sc = url.scheme, ["http", "https"].contains(sc) {
            NSWorkspace.shared.open(url)
        }
        return nil
    }

    // 「📎 파일 붙이기」를 누르면 맥 파일 고르기 창을 띄운다 (없으면 WKWebView 에서 아무 일도 안 일어난다)
    func webView(_ w: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        let p = NSOpenPanel()
        p.allowsMultipleSelection = parameters.allowsMultipleSelection
        p.canChooseDirectories = false
        p.beginSheetModal(for: window) { r in completionHandler(r == .OK ? p.urls : nil) }
    }

    // 화면 안 confirm()·alert() 가 WKWebView 에서도 뜨게 한다 (없으면 confirm 이 늘 '아니오')
    func webView(_ w: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let a = NSAlert(); a.messageText = message; a.addButton(withTitle: L("확인", "OK")); a.addButton(withTitle: L("취소", "Cancel"))
        completionHandler(a.runModal() == .alertFirstButtonReturn)
    }
    func webView(_ w: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let a = NSAlert(); a.messageText = message; a.addButton(withTitle: L("확인", "OK")); a.runModal(); completionHandler()
    }

    // 창을 닫아도 앱(마을 서버)은 살아 있다 — 독 아이콘을 누르면 창이 다시 뜬다 (11-26 혼자 꺼짐 사고)
    func applicationShouldTerminateAfterLastWindowClosed(_ s: NSApplication) -> Bool { false }

    func applicationShouldHandleReopen(_ s: NSApplication, hasVisibleWindows: Bool) -> Bool {
        if !hasVisibleWindows { window.makeKeyAndOrderFront(nil) }
        return true
    }

    // 누가 끄라고 했는지 남긴다: 키보드(⌘Q)·메뉴인지, 다른 프로그램이 보낸 종료 신호인지
    func applicationShouldTerminate(_ s: NSApplication) -> NSApplication.TerminateReply {
        var who = "알 수 없음"
        if let ev = NSAppleEventManager.shared().currentAppleEvent {
            let pid = ev.attributeDescriptor(forKeyword: keySenderPIDAttr)?.int32Value ?? 0
            let name = NSRunningApplication(processIdentifier: pid_t(pid))?.localizedName ?? "pid \(pid)"
            who = "다른 프로그램의 종료 신호 (\(name))"
        } else if let e = NSApp.currentEvent {
            who = e.type == .keyDown ? "키보드 \(e.modifierFlags.contains(.command) ? "⌘" : "")\(e.charactersIgnoringModifiers ?? "")" : "메뉴·마우스 (\(e.type.rawValue))"
        }
        logLine("끄라는 요청: " + who)
        return .terminateNow
    }

    func webViewWebContentProcessDidTerminate(_ w: WKWebView) {
        logLine("화면 처리기가 죽어서 다시 불러옵니다")
        w.reload()
    }

    func applicationWillTerminate(_ n: Notification) {
        if #available(macOS 15.0, *), let r = recorder as? VillageRecorder, r.isRecording { r.stop(); Thread.sleep(forTimeInterval: 1.5) }
        quitting = true
        logLine("앱을 끕니다")
        server?.terminate()
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
