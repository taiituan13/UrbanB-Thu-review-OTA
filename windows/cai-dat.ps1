# Cài hoặc cập nhật extension "Thu review OTA" trên máy Windows của khách sạn.
#
# Cài lần đầu: mở PowerShell (không cần quyền quản trị), dán dòng dưới rồi Enter.
#   irm https://raw.githubusercontent.com/taiituan13/UrbanB-Thu-review-OTA/main/windows/cai-dat.ps1 | iex
#
# Việc nó làm:
#   1. Tải bản mới nhất từ GitHub, chép vào C:\UrbanB\extension. Thư mục phải cố định: Chrome
#      nhận diện bản cài giải nén theo đường dẫn, đổi thư mục là thành extension khác, mất cài
#      đặt đã điền và sinh mã máy mới.
#   2. Lưu chính nó thành C:\UrbanB\cai-dat.ps1 và đăng ký tác vụ hẹn giờ chạy nó với -CapNhat
#      mỗi 3 giờ từ 7:00 tới 22:00 (máy tắt lúc đó thì chạy bù khi bật). Bản mới chỉ được chép
#      khi phiên bản trên GitHub cao hơn. Extension tự nạp lại khi thấy trên đĩa mới hơn
#      (extension/update.js).
#
# Tệp trong repo để UTF-8 không BOM vì "irm | iex" đọc nó như một chuỗi. Bản lưu trên máy được
# ghi lại CÓ BOM: PowerShell 5.1 chạy -File đọc tệp không BOM theo bảng mã ANSI, và vài byte
# UTF-8 của chữ Việt bị đọc thành dấu nháy cong, thứ PowerShell coi là dấu nháy thật.
#
# Không dùng "exit": chạy qua iex thì exit đóng luôn cửa sổ PowerShell của người cài.

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue" # thanh tiến độ làm Invoke-WebRequest chậm hàng chục lần
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

$Repo = "taiituan13/UrbanB-Thu-review-OTA"
$Root = "C:\UrbanB"
$ExtDir = Join-Path $Root "extension"
$Self = Join-Path $Root "cai-dat.ps1"
$Log = Join-Path $Root "cap-nhat.log"
$TaskName = "UrbanB - cap nhat Thu review OTA"
$CapNhat = $args -contains "-CapNhat"

function Write-Log($text) {
  if (-not $CapNhat) { Write-Host $text }
  Add-Content -Path $Log -Value ("{0:yyyy-MM-dd HH:mm:ss}  {1}" -f (Get-Date), $text) -Encoding UTF8
  $all = @(Get-Content -Path $Log -Encoding UTF8)
  if ($all.Count -gt 300) { $all | Select-Object -Last 200 | Set-Content -Path $Log -Encoding UTF8 }
}

function ConvertTo-Version($text) {
  try { return [version]$text } catch { return $null }
}

function Get-LocalVersion {
  $manifest = Join-Path $ExtDir "manifest.json"
  if (-not (Test-Path $manifest)) { return $null }
  try { return (Get-Content -Raw -Encoding UTF8 $manifest | ConvertFrom-Json).version } catch { return $null }
}

function Get-RemoteVersion {
  $url = "https://raw.githubusercontent.com/$Repo/main/extension/manifest.json"
  return ((Invoke-WebRequest -Uri $url -UseBasicParsing -Headers @{ "Cache-Control" = "no-cache" }).Content | ConvertFrom-Json).version
}

function Install-Latest {
  $tmp = Join-Path $env:TEMP ("urbanb-" + [guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Path $tmp | Out-Null
  try {
    $zip = Join-Path $tmp "main.zip"
    Invoke-WebRequest -Uri "https://github.com/$Repo/archive/refs/heads/main.zip" -OutFile $zip -UseBasicParsing
    Expand-Archive -Path $zip -DestinationPath $tmp -Force
    $top = Get-ChildItem -Path $tmp -Directory |
      Where-Object { Test-Path (Join-Path $_.FullName "extension\manifest.json") } |
      Select-Object -First 1
    if (-not $top) { throw "Tệp tải về không có thư mục extension." }
    $src = Join-Path $top.FullName "extension"
    New-Item -ItemType Directory -Path $ExtDir -Force | Out-Null
    # /MIR làm thư mục đích giống hệt bản mới, kể cả xoá tệp bản mới đã bỏ. manifest.json chép
    # SAU CÙNG: extension thấy số phiên bản mới là tự nạp lại, nên lúc đó mọi tệp khác phải xong.
    robocopy $src $ExtDir /MIR /XF manifest.json /R:2 /W:2 /NJH /NJS /NFL /NDL /NP | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "Chép tệp hỏng (robocopy mã $LASTEXITCODE)." }
    Copy-Item -Path (Join-Path $src "manifest.json") -Destination $ExtDir -Force
    $script = Join-Path $top.FullName "windows\cai-dat.ps1"
    if (Test-Path $script) {
      [IO.File]::WriteAllText($Self, [IO.File]::ReadAllText($script, [Text.Encoding]::UTF8), (New-Object Text.UTF8Encoding $true))
    }
  } finally {
    Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
  }
}

function Register-UpdateTask {
  $arguments = "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File $Self -CapNhat"
  try {
    $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $arguments
    $trigger = New-ScheduledTaskTrigger -Daily -At "07:00"
    $trigger.Repetition = (New-ScheduledTaskTrigger -Once -At "07:00" -RepetitionInterval (New-TimeSpan -Hours 3) -RepetitionDuration (New-TimeSpan -Hours 15)).Repetition
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 15)
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Description "Tải bản mới của extension Thu review OTA từ GitHub (UrbanB)." -Force | Out-Null
  } catch {
    # Dự phòng cho máy chặn Register-ScheduledTask: schtasks không chạy bù khi máy tắt, nhưng vẫn đủ dùng.
    schtasks /Create /TN $TaskName /TR "powershell.exe $arguments" /SC HOURLY /MO 3 /F | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Không đăng ký được tác vụ tự cập nhật (schtasks mã $LASTEXITCODE)." }
  }
}

New-Item -ItemType Directory -Path $Root -Force | Out-Null
try {
  $local = Get-LocalVersion
  if ($CapNhat) {
    $remote = Get-RemoteVersion
    $have = ConvertTo-Version $local
    $want = ConvertTo-Version $remote
    if ($have -and $want -and $want -le $have) { return }
    Install-Latest
    Write-Log "Đã cập nhật $local -> $(Get-LocalVersion). Extension tự nạp lại trong vòng 30 phút."
    return
  }

  Write-Host "Đang tải bản mới nhất từ GitHub..."
  Install-Latest
  Register-UpdateTask
  Write-Log "Đã cài bản $(Get-LocalVersion) vào $ExtDir và bật tự cập nhật."
  try { Set-Clipboard -Value $ExtDir } catch {} # không chép được thì người cài gõ tay đường dẫn in bên dưới
  Write-Host ""
  Write-Host "Còn 4 bước trong Chrome:" -ForegroundColor Green
  Write-Host "  1. Gõ vào thanh địa chỉ của Chrome:  chrome://extensions"
  Write-Host "  2. Bật 'Chế độ dành cho nhà phát triển' (góc trên bên phải). Để bật mãi: tắt đi là extension ngừng chạy."
  Write-Host "  3. Bấm 'Tải tiện ích đã giải nén'. Trong hộp chọn thư mục, dán đường dẫn vào ô địa chỉ"
  Write-Host "     (đã chép sẵn: $ExtDir) rồi bấm 'Chọn thư mục'."
  Write-Host "  4. Bấm biểu tượng mảnh ghép, ghim 'Thu review OTA', mở nó, dán mã cài đặt, bấm 'Áp dụng'."
  Write-Host ""
  Write-Host "Máy đã cài từ $ExtDir trước đây thì không cần làm lại 4 bước này."
} catch {
  Write-Log ("LỖI: " + $_.Exception.Message)
  if (-not $CapNhat) { Write-Host "Cài không xong. Chụp màn hình này gửi người quản lý." -ForegroundColor Red }
}
