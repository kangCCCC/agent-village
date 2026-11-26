// 마을 창 녹화 — ScreenCaptureKit 으로 마을 창만 찍고, 같은 흐름에서 맥 마이크도 같이 받아 한 파일(.mov)에 담는다.
// 영상·마이크·마을 소리가 모두 같은 시계(호스트 시각)로 찍혀 나오므로 따로 싱크를 맞출 필요가 없다.
// 파일 안 트랙: 영상 1 · 마이크 1 · 마을 소리(대화 읽기 등 앱 소리) 1  → 프리미어에서 트랙별로 따로 만질 수 있다.
import AppKit
import AVFoundation
import CoreMedia
import ScreenCaptureKit

@available(macOS 15.0, *)
final class VillageRecorder: NSObject, SCStreamOutput, SCStreamDelegate {
    private var stream: SCStream?
    private var writer: AVAssetWriter?
    private var vIn: AVAssetWriterInput?
    private var micIn: AVAssetWriterInput?
    private var appIn: AVAssetWriterInput?
    private var started = false
    private(set) var finishing = false      // 멈춘 녹화를 파일로 마무리하는 중 (그동안 새 녹화를 막는다)
    private var startPTS = CMTime.invalid
    private let q = DispatchQueue(label: "village.recorder")
    private(set) var url: URL?
    var onState: ((String, String) -> Void)?      // (상태, 설명)
    var isRecording: Bool { stream != nil }

    static func folder() -> URL {
        let d = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Movies/에이전트빌리지 녹화", isDirectory: true)
        try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true)
        return d
    }

    func start(window: NSWindow) {
        guard stream == nil else { return }
        if finishing { onState?("error", "앞 녹화를 아직 저장하는 중이에요. 저장이 끝난 뒤 다시 눌러 주세요."); return }
        // 마이크 허락부터 (처음 한 번 맥이 묻는다)
        AVCaptureDevice.requestAccess(for: .audio) { micOK in
            SCShareableContent.getExcludingDesktopWindows(false, onScreenWindowsOnly: true) { content, err in
                DispatchQueue.main.async {
                    guard let content = content else {
                        self.onState?("error", "화면 기록 허락이 필요합니다. 시스템 설정 → 개인정보 보호 및 보안 → 화면 및 시스템 오디오 기록에서 「에이전트빌리지」을 켜고 앱을 다시 켜 주세요. (\(err?.localizedDescription ?? ""))")
                        return
                    }
                    guard let scw = content.windows.first(where: { $0.windowID == CGWindowID(window.windowNumber) }) else {
                        self.onState?("error", "마을 창을 못 찾았습니다. 창이 화면에 보이는 상태에서 다시 눌러 주세요.")
                        return
                    }
                    self.begin(scw: scw, window: window, mic: micOK)
                }
            }
        }
    }

    private func begin(scw: SCWindow, window: NSWindow, mic: Bool) {
        let scale = window.backingScaleFactor
        var w = Int(scw.frame.width * scale), h = Int(scw.frame.height * scale)
        w -= w % 2; h -= h % 2
        let cfg = SCStreamConfiguration()
        cfg.width = w; cfg.height = h
        cfg.minimumFrameInterval = CMTime(value: 1, timescale: 30)
        cfg.pixelFormat = kCVPixelFormatType_32BGRA
        cfg.showsCursor = true
        cfg.queueDepth = 8
        cfg.capturesAudio = true                 // 마을 소리(대화 읽기 등)
        cfg.sampleRate = 48000
        cfg.channelCount = 2
        cfg.excludesCurrentProcessAudio = false
        cfg.captureMicrophone = mic              // 맥 마이크
        let filter = SCContentFilter(desktopIndependentWindow: scw)

        let name = "마을녹화_" + {
            let f = DateFormatter(); f.dateFormat = "yyyyMMdd_HHmmss"; return f.string(from: Date())
        }() + ".mov"
        let out = VillageRecorder.folder().appendingPathComponent(name)
        do {
            let wr = try AVAssetWriter(outputURL: out, fileType: .mov)
            // 10초마다 목차를 조금씩 써 둔다 → 앱이 꺼지거나 마무리가 실패해도 그때까지는 열리는 파일로 남는다 (11-26 36분짜리가 목차 없이 깨짐)
            wr.movieFragmentInterval = CMTime(seconds: 10, preferredTimescale: 600)
            // HEVC + 화면 녹화에 맞춘 비트레이트: 예전 H.264 w*h*6(레티나 창 약 28Mbps, 시간당 12GB) → 약 9Mbps(시간당 4GB 안쪽).
            // 마을 화면은 움직임이 적어 이 정도로도 글자가 또렷하다. 프리미어에서 그대로 열린다. (11-26 맥 용량 보고)
            let v = AVAssetWriterInput(mediaType: .video, outputSettings: [
                AVVideoCodecKey: AVVideoCodecType.hevc, AVVideoWidthKey: w, AVVideoHeightKey: h,
                AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: min(12_000_000, max(4_000_000, w * h * 2)),
                                                  AVVideoExpectedSourceFrameRateKey: 30]])
            v.expectsMediaDataInRealTime = true
            wr.add(v)
            let aac: (Int) -> [String: Any] = { ch in
                var lay = AudioChannelLayout()
                lay.mChannelLayoutTag = ch == 1 ? kAudioChannelLayoutTag_Mono : kAudioChannelLayoutTag_Stereo
                return [AVFormatIDKey: kAudioFormatMPEG4AAC, AVSampleRateKey: 48000, AVNumberOfChannelsKey: ch,
                        AVEncoderBitRateKey: ch == 1 ? 128_000 : 192_000,
                        AVChannelLayoutKey: Data(bytes: &lay, count: MemoryLayout<AudioChannelLayout>.size)]
            }
            if mic {
                let m = AVAssetWriterInput(mediaType: .audio, outputSettings: aac(1))
                m.expectsMediaDataInRealTime = true
                wr.add(m); micIn = m
            }
            let a = AVAssetWriterInput(mediaType: .audio, outputSettings: aac(2))
            a.expectsMediaDataInRealTime = true
            wr.add(a); appIn = a
            writer = wr; vIn = v; url = out; started = false; startPTS = .invalid
            guard wr.startWriting() else { throw wr.error ?? NSError(domain: "rec", code: 1) }

            let s = SCStream(filter: filter, configuration: cfg, delegate: self)
            try s.addStreamOutput(self, type: .screen, sampleHandlerQueue: q)
            try s.addStreamOutput(self, type: .audio, sampleHandlerQueue: q)
            if mic { try s.addStreamOutput(self, type: .microphone, sampleHandlerQueue: q) }
            stream = s
            s.startCapture { e in
                DispatchQueue.main.async {
                    if let e = e {
                        self.stream = nil; self.writer?.cancelWriting(); self.writer = nil
                        self.onState?("error", "녹화를 시작하지 못했습니다: \(e.localizedDescription) — 처음이면 시스템 설정에서 화면 기록 허락 후 앱을 다시 켜 주세요.")
                    } else {
                        self.onState?("rec", mic ? "녹화 중 (마이크 같이)" : "녹화 중 (마이크 허락이 없어 소리는 마을 소리만)")
                    }
                }
            }
        } catch {
            onState?("error", "녹화 파일을 못 만들었습니다: \(error.localizedDescription)")
            writer = nil
        }
    }

    func stop() {
        guard let s = stream else { return }
        stream = nil
        finishing = true
        s.stopCapture { _ in
            // 화면·소리 조각과 같은 줄(q)에서: 이 녹화의 writer·입력을 지역 변수로 잡고 self 에서는 떼어 낸다
            // (예전엔 마무리 콜백이 self.writer 를 다시 읽고 nil 로 지워서, 그사이 시작한 새 녹화를 망가뜨릴 수 있었다)
            self.q.async {
                let wr = self.writer, v = self.vIn, m = self.micIn, a = self.appIn, u = self.url, began = self.started
                self.writer = nil; self.vIn = nil; self.micIn = nil; self.appIn = nil
                let done: (String, String) -> Void = { st, msg in
                    DispatchQueue.main.async { self.finishing = false; self.onState?(st, msg) }
                }
                guard let wr = wr else { done("error", "저장할 녹화가 없습니다"); return }
                v?.markAsFinished(); m?.markAsFinished(); a?.markAsFinished()
                if !began { wr.cancelWriting(); done("error", "찍힌 화면이 없어 파일을 만들지 않았습니다"); return }
                wr.finishWriting {
                    if wr.status == .completed, let u = u {
                        done("saved", u.path)
                        DispatchQueue.main.async { NSWorkspace.shared.activateFileViewerSelecting([u]) }
                    } else {
                        done("error", "저장 실패: \(wr.error?.localizedDescription ?? "알 수 없음") — 10초 단위로 써 둔 부분까지는 파일에 남아 있습니다")
                    }
                }
            }
        }
    }

    // 모든 조각이 같은 시계로 온다: 첫 화면 조각 시각에서 파일을 시작하고, 그 전 소리는 버린다
    func stream(_ s: SCStream, didOutputSampleBuffer sb: CMSampleBuffer, of type: SCStreamOutputType) {
        guard let wr = writer, wr.status == .writing, CMSampleBufferDataIsReady(sb) else { return }
        let pts = CMSampleBufferGetPresentationTimeStamp(sb)
        switch type {
        case .screen:
            guard let att = CMSampleBufferGetSampleAttachmentsArray(sb, createIfNecessary: false) as? [[SCStreamFrameInfo: Any]],
                  let raw = att.first?[.status] as? Int, SCFrameStatus(rawValue: raw) == .complete else { return }
            if !started { wr.startSession(atSourceTime: pts); startPTS = pts; started = true }
            if vIn?.isReadyForMoreMediaData == true { vIn?.append(sb) }
        case .microphone:
            guard started, pts >= startPTS else { return }
            if micIn?.isReadyForMoreMediaData == true { micIn?.append(sb) }
        case .audio:
            guard started, pts >= startPTS else { return }
            if appIn?.isReadyForMoreMediaData == true { appIn?.append(sb) }
        @unknown default: break
        }
    }

    func stream(_ s: SCStream, didStopWithError error: Error) {
        DispatchQueue.main.async {
            if self.stream != nil { self.onState?("error", "녹화가 멈췄습니다: \(error.localizedDescription)"); self.stop() }
        }
    }
}
