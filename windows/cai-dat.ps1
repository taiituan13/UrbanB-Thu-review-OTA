# Cài hoặc cập nhật extension "Thu review OTA" trên máy Windows của khách sạn.
#
# Cài lần đầu: mở PowerShell (không cần quyền quản trị), dán dòng dưới rồi Enter.
#   irm https://raw.githubusercontent.com/taiituan13/UrbanB-Thu-review-OTA/main/windows/cai-dat.ps1 | iex
#
# Việc nó làm: tải bản mới nhất từ GitHub, chép vào C:\UrbanB\extension. Thư mục phải cố định:
# Chrome nhận diện bản cài giải nén theo đường dẫn, đổi thư mục là thành extension khác, mất cài
# đặt đã điền và sinh mã máy mới.
#
# Cài kèm mã cài đặt (từ 0.9.0): người quản lý tạo lệnh trong Sheet (Review OTA › Tạo lệnh cài cho
# khách sạn), dạng  $UrbanBMa='URB1…'; irm …/cai-dat.ps1 | iex . Lệnh này ghi mã vào
# ma-cai-dat.txt trong thư mục extension; extension tự đọc tệp, tự điền Cài đặt và tự thử Sheet
# (extension/setup-code.js). Mã có mã bí mật Sheet, nằm trên máy như cài đặt đã lưu trong Chrome.
#
# Cập nhật: chạy lại đúng lệnh trên. Nó chép đè cùng thư mục; extension tự kiểm thư mục mỗi 30
# phút và tự nạp lại khi thấy bản trên đĩa mới hơn (extension/update.js), nên không phải làm lại
# các bước trong Chrome.
#
# Tự cập nhật theo hẹn giờ đã TẠM BỎ (user chốt 08/10/2026). Bản 0.6.0 của tệp này từng đăng ký
# tác vụ hẹn giờ; lệnh này gỡ tác vụ đó nếu máy còn giữ. Muốn bật lại: xem lịch sử git của tệp.
#
# Không dùng "exit": chạy qua iex thì exit đóng luôn cửa sổ PowerShell của người cài.

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue" # thanh tiến độ làm Invoke-WebRequest chậm hàng chục lần
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

$Repo = "taiituan13/UrbanB-Thu-review-OTA"
$Root = "C:\UrbanB"
$ExtDir = Join-Path $Root "extension"
$Log = Join-Path $Root "cai-dat.log"
$SetupFile = Join-Path $ExtDir "ma-cai-dat.txt"
$OldTask = "UrbanB - cap nhat Thu review OTA"

function Write-Log($text) {
  Write-Host $text
  Add-Content -Path $Log -Value ("{0:yyyy-MM-dd HH:mm:ss}  {1}" -f (Get-Date), $text) -Encoding UTF8
}

function Get-LocalVersion {
  $manifest = Join-Path $ExtDir "manifest.json"
  if (-not (Test-Path $manifest)) { return $null }
  try { return (Get-Content -Raw -Encoding UTF8 $manifest | ConvertFrom-Json).version } catch { return $null }
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
    # ma-cai-dat.txt không có trong bản tải về: /XF giữ nó lại, /MIR không xoá.
    robocopy $src $ExtDir /MIR /XF manifest.json ma-cai-dat.txt /R:2 /W:2 /NJH /NJS /NFL /NDL /NP | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "Chép tệp hỏng (robocopy mã $LASTEXITCODE)." }
    Copy-Item -Path (Join-Path $src "manifest.json") -Destination $ExtDir -Force
  } finally {
    Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
  }
}

# Mã cài đặt "URB1." + base64url(JSON UTF-8). Trả tên khách sạn trong mã để in ra cho người cài
# đối chiếu; mã hỏng thì dừng trước khi đụng vào thư mục cài.
function Read-SetupHotel($code) {
  if ($code -notmatch '^URB1\.([A-Za-z0-9_-]+)=*$') { throw "Mã cài đặt sai dạng. Xin người quản lý gửi lại lệnh." }
  $b64 = $Matches[1].Replace('-', '+').Replace('_', '/')
  $b64 += "=" * ((4 - $b64.Length % 4) % 4)
  try {
    $data = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b64)) | ConvertFrom-Json
  } catch {
    throw "Mã cài đặt bị cắt hoặc chép sai. Chép lại nguyên dòng lệnh."
  }
  if (-not $data.hotel) { throw "Mã cài đặt thiếu tên khách sạn." }
  return $data.hotel
}

# Gỡ tác vụ hẹn giờ và bản chép của chính lệnh này mà bản 0.6.0 để lại.
function Remove-OldUpdateTask {
  # Máy không có tác vụ đó, hoặc Windows cũ không có lệnh này: bỏ qua, đừng làm hỏng lượt cài.
  try { Unregister-ScheduledTask -TaskName $OldTask -Confirm:$false -ErrorAction Stop } catch {}
  Remove-Item -Path (Join-Path $Root "cai-dat.ps1") -Force -ErrorAction SilentlyContinue
}

New-Item -ItemType Directory -Path $Root -Force | Out-Null
try {
  $before = Get-LocalVersion
  # Biến do dòng lệnh của người quản lý đặt; lệnh cập nhật thường không có ⇒ tệp mã cũ để yên.
  $setupCode = ("" + $UrbanBMa) -replace '\s', ''
  $setupHotel = $null
  if ($setupCode) {
    $setupHotel = Read-SetupHotel $setupCode
    New-Item -ItemType Directory -Path $ExtDir -Force | Out-Null
    # Ghi TRƯỚC manifest.json: bản mới tự nạp lại là đọc được mã ngay. Không BOM.
    [IO.File]::WriteAllText($SetupFile, $setupCode)
  }
  Write-Host "Đang tải bản mới nhất từ GitHub..."
  Install-Latest
  Remove-OldUpdateTask
  $after = Get-LocalVersion
  try { Set-Clipboard -Value $ExtDir } catch {} # không chép được thì người cài gõ tay đường dẫn in bên dưới
  if ($setupHotel) {
    Write-Log "Đã ghi mã cài đặt của khách sạn: $setupHotel"
  }
  if ($before) {
    Write-Log "Đã cập nhật $before -> $after trong $ExtDir. Extension tự nạp lại trong vòng 30 phút."
    if ($setupHotel) {
      Write-Host "Extension đang chạy tự nhận mã trong vòng 30 phút, hoặc ngay khi mở ô Thu review OTA."
    }
    Write-Host "Muốn chạy bản mới ngay: vào chrome://extensions, bấm nút nạp lại của 'Thu review OTA'."
    Write-Host ""
    Write-Host "Nếu Chrome chưa từng nạp thư mục này, làm 4 bước dưới đây."
  } else {
    Write-Log "Đã cài bản $after vào $ExtDir."
  }
  Write-Host ""
  Write-Host "Còn 4 bước trong Chrome:" -ForegroundColor Green
  Write-Host "  1. Gõ vào thanh địa chỉ của Chrome:  chrome://extensions"
  Write-Host "  2. Bật 'Chế độ dành cho nhà phát triển' (góc trên bên phải). Để bật mãi: tắt đi là extension ngừng chạy."
  Write-Host "  3. Bấm 'Tải tiện ích đã giải nén'. Trong hộp chọn thư mục, dán đường dẫn vào ô địa chỉ"
  Write-Host "     (đã chép sẵn: $ExtDir) rồi bấm 'Chọn thư mục'."
  if ($setupHotel) {
    Write-Host "  4. Bấm biểu tượng mảnh ghép, ghim 'Thu review OTA' rồi mở nó. Phải thấy tên '$setupHotel'"
    Write-Host "     và dòng 'Đã nhận cài đặt ... Sheet trả lời'. Không phải điền gì thêm."
  } else {
    Write-Host "  4. Bấm biểu tượng mảnh ghép, ghim 'Thu review OTA', mở nó, điền tên khách sạn, URL, mã bí mật,"
    Write-Host "     chọn kênh, bấm 'Thử Sheet'. (Người quản lý có mã cài đặt thì dán vào ô Mã cài đặt, bấm Nhận mã.)"
  }
} catch {
  Write-Log ("LỖI: " + $_.Exception.Message)
  Write-Host "Cài không xong. Chụp màn hình này gửi người quản lý." -ForegroundColor Red
}
