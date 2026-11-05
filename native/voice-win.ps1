# Windows 语音输入：System.Speech 本机识别（不联网）。协议与 macOS 的 voice-helper 相同：
# 逐行输出 JSON {type: partial|final|error|end, text}；stdin 收到一行 "stop" 后结束。
param([string]$Lang = 'zh-CN')
$ErrorActionPreference = 'Stop'
$en = $Lang.StartsWith('en')
function T($zh, $enText) { if ($en) { $enText } else { $zh } }
$enc = New-Object System.Text.UTF8Encoding $false
$out = New-Object System.IO.StreamWriter([Console]::OpenStandardOutput(), $enc)
$out.AutoFlush = $true
function Emit($type, $text) { $out.WriteLine((@{ type = $type; text = [string]$text } | ConvertTo-Json -Compress)) }
function Tidy($t) { [regex]::Replace([string]$t, '(?<=[一-鿿，。？！、])\s+(?=[一-鿿])', '') }

try {
  Add-Type -AssemblyName System.Speech
  $info = [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers() |
    Where-Object { $_.Culture.Name -eq $Lang } | Select-Object -First 1
  if (-not $info) {
    $info = [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers() |
      Where-Object { $_.Culture.TwoLetterISOLanguageName -eq $Lang.Substring(0, 2) } | Select-Object -First 1
  }
  if (-not $info) {
    Emit 'error' (T '这台电脑没有安装中文语音识别。可在“设置 > 时间和语言 > 语言和区域”添加简体中文并安装“语音”，或在输入框里按 Win+H 使用系统听写。' 'No English speech recognizer is installed. Add English under Settings > Time & language > Language & region and install its Speech pack, or press Win+H in the input box to use Windows dictation.')
    exit 0
  }
  $engine = New-Object System.Speech.Recognition.SpeechRecognitionEngine($info)
  $engine.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))
  try { $engine.SetInputToDefaultAudioDevice() } catch {
    Emit 'error' (T '找不到麦克风，或麦克风权限被关闭。请在“设置 > 隐私和安全性 > 麦克风”里允许桌面应用使用麦克风，再试一次。' 'No microphone found, or microphone access is off. Allow desktop apps to use the microphone under Settings > Privacy & security > Microphone, then try again.')
    exit 0
  }
  Register-ObjectEvent -InputObject $engine -EventName SpeechHypothesized -SourceIdentifier hyp | Out-Null
  Register-ObjectEvent -InputObject $engine -EventName SpeechRecognized -SourceIdentifier fin | Out-Null
  $stdin = New-Object System.IO.StreamReader([Console]::OpenStandardInput())
  $line = $stdin.ReadLineAsync()
  $engine.RecognizeAsync([System.Speech.Recognition.RecognizeMode]::Multiple)
  $final = ''
  $heard = $false
  $clock = [Diagnostics.Stopwatch]::StartNew()
  $stopping = $false
  $stopAt = 0
  while ($true) {
    Start-Sleep -Milliseconds 80
    foreach ($e in @(Get-Event)) {
      $r = $e.SourceEventArgs.Result
      if ($r -and $r.Text) {
        $heard = $true
        if ($e.SourceIdentifier -eq 'fin') { $final = $final + (Tidy $r.Text); Emit 'partial' $final }
        else { Emit 'partial' ($final + (Tidy $r.Text)) }
      }
      Remove-Event -EventIdentifier $e.EventIdentifier
    }
    if (-not $stopping -and ($line.IsCompleted -or (-not $heard -and $clock.Elapsed.TotalSeconds -gt 15))) {
      $stopping = $true
      $stopAt = $clock.ElapsedMilliseconds
      try { $engine.RecognizeAsyncCancel() } catch {}
    }
    # 取消后再留 0.6 秒收尾事件
    if ($stopping -and ($clock.ElapsedMilliseconds - $stopAt) -gt 600) { break }
  }
  try { $engine.Dispose() } catch {}
  if (-not $heard) { Emit 'error' 'No speech detected' }
  else { Emit 'final' $final; Emit 'end' '' }
} catch {
  Emit 'error' ((T '语音识别启动失败：' 'Speech recognition failed to start: ') + $_.Exception.Message)
}
