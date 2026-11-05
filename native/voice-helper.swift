// 语音输入 helper：SFSpeechRecognizer + AVAudioEngine，每行输出一条 JSON。
// 收到 stdin 一行 "stop"（或 SIGTERM/SIGINT）后结束录音并输出 final。
import Foundation
import Speech
import AVFoundation

func emit(_ type: String, _ text: String = "") {
    let obj: [String: String] = ["type": type, "text": text]
    if let d = try? JSONSerialization.data(withJSONObject: obj), let s = String(data: d, encoding: .utf8) {
        print(s)
        fflush(stdout)
    }
}

// 权限检查模式：--auth-status 只查询，--request-auth 弹系统询问；输出 {"auth":"authorized|denied|restricted|notDetermined"}
func authName(_ s: SFSpeechRecognizerAuthorizationStatus) -> String {
    switch s {
    case .authorized: return "authorized"
    case .denied: return "denied"
    case .restricted: return "restricted"
    default: return "notDetermined"
    }
}
func printAuth(_ s: SFSpeechRecognizerAuthorizationStatus) {
    print("{\"auth\":\"\(authName(s))\"}")
    fflush(stdout)
}
if CommandLine.arguments.contains("--auth-status") {
    printAuth(SFSpeechRecognizer.authorizationStatus())
    exit(0)
}
if CommandLine.arguments.contains("--request-auth") {
    SFSpeechRecognizer.requestAuthorization { status in
        printAuth(status)
        exit(0)
    }
    dispatchMain()
}

// 识别语言由第一个参数指定（zh-CN / en-US），默认中文
let localeId = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "zh-CN"
let recognizer = SFSpeechRecognizer(locale: Locale(identifier: localeId))
func t(_ zh: String, _ en: String) -> String { localeId.hasPrefix("en") ? en : zh }
let engine = AVAudioEngine()
let request = SFSpeechAudioBufferRecognitionRequest()
var lastText = ""
var finished = false

func finish() {
    if finished { return }
    finished = true
    emit("final", lastText)
    emit("end")
    exit(0)
}

func start() {
    guard let recognizer = recognizer, recognizer.isAvailable else {
        emit("error", t("语音识别不可用。请在“系统设置 → 键盘 → 听写”中开启，并确认已联网或已下载对应语言。", "Speech recognition is unavailable. Turn on Dictation in System Settings → Keyboard, and make sure you are online or the language is downloaded."))
        exit(1)
    }
    request.shouldReportPartialResults = true
    if recognizer.supportsOnDeviceRecognition { request.requiresOnDeviceRecognition = true }
    let task = recognizer.recognitionTask(with: request) { result, error in
        if let r = result {
            lastText = r.bestTranscription.formattedString
            if r.isFinal { finish() } else { emit("partial", lastText) }
        }
        if let e = error, !finished {
            if lastText.isEmpty { emit("error", t("识别出错：", "Recognition error: ") + e.localizedDescription); exit(1) }
            finish()
        }
    }
    _ = task
    let input = engine.inputNode
    let format = input.outputFormat(forBus: 0)
    input.installTap(onBus: 0, bufferSize: 1024, format: format) { buf, _ in request.append(buf) }
    do {
        engine.prepare()
        try engine.start()
    } catch {
        emit("error", t("无法打开麦克风：", "Can't open the microphone: ") + error.localizedDescription)
        exit(1)
    }
}

func stopRecording() {
    engine.stop()
    engine.inputNode.removeTap(onBus: 0)
    request.endAudio()
    // 若识别器迟迟不给 final，2 秒后强制结束
    DispatchQueue.main.asyncAfter(deadline: .now() + 2) { finish() }
}

signal(SIGTERM, SIG_IGN); signal(SIGINT, SIG_IGN)
let sigs = [SIGTERM, SIGINT].map { s -> DispatchSourceSignal in
    let src = DispatchSource.makeSignalSource(signal: s, queue: .main)
    src.setEventHandler { stopRecording() }
    src.resume()
    return src
}
_ = sigs

DispatchQueue.global().async {
    while let line = readLine() {
        if line.trimmingCharacters(in: .whitespaces) == "stop" { DispatchQueue.main.async { stopRecording() }; return }
    }
    DispatchQueue.main.async { stopRecording() }  // stdin 关闭（父进程退出）
}

SFSpeechRecognizer.requestAuthorization { status in
    DispatchQueue.main.async {
        guard status == .authorized else {
            emit("error", t("没有语音识别权限，请到“系统设置 → 隐私与安全性 → 语音识别”中允许 TabPilot。", "No speech recognition access. Allow TabPilot in System Settings → Privacy & Security → Speech Recognition."))
            exit(1)
        }
        AVCaptureDevice.requestAccess(for: .audio) { ok in
            DispatchQueue.main.async {
                if ok { start() } else { emit("error", t("没有麦克风权限，请到“系统设置 → 隐私与安全性 → 麦克风”中允许 TabPilot。", "No microphone access. Allow TabPilot in System Settings → Privacy & Security → Microphone.")); exit(1) }
            }
        }
    }
}
dispatchMain()
