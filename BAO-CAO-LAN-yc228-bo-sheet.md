# Báo cáo làn yc228-bo-sheet (repo urbanb-reviews)

YC-228 · YC-194 · YC-223. Nhánh `lane/yc228-bo-sheet`, tách từ `ed3ed4b` (bản 1.5.1). Chưa push, chưa merge,
chưa chạy trên máy Windows hay Chrome thật.

| sha | Nội dung |
|---|---|
| `1e9eeb1` | Mục ①: `windows/cai-dat.ps1` giải nén dưới `C:\UrbanB\tmp\<guid>`, dọn cả khi lỗi; bật UTF-8 cho cửa sổ (YC-223) |
| `701fae4` | Mục ②: bản 1.5.2, review chỉ lên Hub, bỏ ghi Google Sheet review (YC-228); tài liệu, CHANGELOG |
| (commit này) | Báo cáo làn; đổi tên một test còn chữ "Sheet" (`test/net.test.mjs`) |

`npm test` (ĐO, sau commit `701fae4` và sau khi đổi tên test): 307 tests, 307 pass, 0 fail.

## ① `windows/cai-dat.ps1` (YC-223)

- `$TmpRoot = Join-Path $Root "tmp"`; mỗi lượt giải nén vào `$TmpRoot\<guid>`, dọn phần sót của lượt trước, khối
  `finally` xoá thư mục của lượt và xoá `$TmpRoot` nếu trống. Không còn `$env:TEMP` (PowerShell 5.1 hỏng với đường
  dẫn ngắn kiểu `ANHRUA~1`).
- Ngay sau `$ErrorActionPreference = "Stop"`: `UTF8Encoding($false)` (không BOM) cho `[Console]::OutputEncoding`
  (bọc `try`, cửa sổ không có console thì bỏ qua) và `$OutputEncoding`.
- Giữ nguyên lệnh cài một dòng, `$Root`, `$UrbanBMa`, `ma-cai-dat.txt` trong `/XF` của robocopy, `UPDATE_COMMAND`.

Test mới trong `test/update.test.mjs`: "giải nén vào thư mục tạm dưới C:\UrbanB, không qua TEMP, dọn cả khi lỗi" và
"bật UTF-8 cho cửa sổ trước dòng chữ đầu tiên". Đột biến (ĐO, `node --test test/update.test.mjs`, phục hồi bằng
`git checkout -- windows/cai-dat.ps1`): đưa `TEMP` trở lại, bỏ dòng `OutputEncoding`, dời dòng UTF-8 xuống sau
`Write-Host` đầu tiên, bỏ phần dọn trong `finally`: mỗi đột biến 7 pass, 1 fail.

## ② Bản 1.5.2: bỏ ghi Sheet A (YC-228)

Tệp mã đã sửa:

- `extension/background.js`: bỏ cả phần gửi Sheet (`postSheet`, `pingSheet`, `deviceInfo`, ảnh chụp điểm, lượt quét,
  báo sống lên Sheet). `scanOne` không còn bước gửi Sheet; kênh `ok` khi quét và chuẩn hoá xong, `message` rỗng.
  Huy hiệu không đọc `lastError`. Tin `pingSheet` đổi thành `pingHub`. `onInstalled`/`onStartup` chạy
  `forgetSheet()` trước `schedule` và `importSetupFile`. Áp mã cài đặt xong thì thử Hub.
- `extension/config.js`: `VERSION` 1.5.2; `DEFAULT_CONFIG` bỏ `sheetUrl`, `secret`; `DROPPED_KEYS` thêm hai khoá ấy;
  `queueLog` chỉ ghi `lastError`, không xếp hàng `pendingLogs`; hàm mới `forgetSheet()` xoá `sheetUrl`/`secret` trong
  cấu hình, `reviewSheet` trong `hubCollect`, `pendingLogs`, và `lastError` có giai đoạn "gửi Sheet". Bỏ
  `loadPendingLogs`, `clearSheetError`, `dropLogs`, `loadLastError`.
- `extension/hub-config.js`: `parseHubSettings` không đọc `reviewSheet`; `effectiveReview` luôn lấy tên và mã chỗ
  nghỉ theo chi nhánh Hub (khi biết chi nhánh), không còn ô Sheet; chưa nhận lời đáp Hub lần nào ⇒ chặn quét với lời
  nhắc đăng nhập. Bỏ `parseReviewSheet`, `reviewSendsSheet`, `sheetSkipHelp`, `sheetSkipText`, `HUB_SHEET_PLACE`.
- `extension/setup-code.js`: mã `URB1.` `v: 1` vẫn đọc được; `sheetUrl`, `secret` trong mã bỏ qua, mã thiếu hai ô ấy
  cũng nhận. `applySetup` xoá `DROPPED_KEYS`.
- `extension/popup.html`, `popup.js`, `popup-model.js`: nút **Thử Hub**; bỏ khung "Lỗi gửi Sheet" và mọi dòng nói
  Sheet.
- `extension/quay/counter-problems.js`: không sinh `REVIEW_SHEET_FAILED` nữa.
- `extension/quay/sw.js`: chỉ dòng `extStatus`: `review.fromHub` = `cfg.review.fromHub.hotel` (trước là `.sheet`).
  Không đụng phần Sheet B / OTA Sync.
- `extension/report.js`: `SheetError` đổi tên `RetryableError` (`HubError` kế thừa); bỏ `parseSheetReply`.
- `extension/hub.js`, `normalize.js` (bỏ `sheetReviews`), `quay/net.js` (bỏ `SHEET_TIMEOUT_MS`), `manifest.json`
  (1.5.2, mô tả).
- Tài liệu: `README.md`, `CLAUDE.md` (mô tả và bảng bản đồ), `docs/cai-dat.md`, `docs/cai-tu-xa.md`, `docs/ma-loi.md`,
  chú thích đầu `windows/cai-dat.ps1`, `package.json`, `CHANGELOG.md` (mục 1.5.2, gồm cả YC-223).
  `apps-script/Code.gs` giữ nguyên; tài liệu ghi rõ không còn dùng cho review từ 1.5.2.

Hợp đồng Hub: không đổi `POST /api/ingest/reviews` hay lượt báo `/api/extension/connection`. Một trường đổi nghĩa (SUY,
cần Hub xem lại): `ext:status` `review.fromHub` nay là "tên khách sạn theo Hub". Màn Cài extension của UrbanB
(`extension-machine-check.tsx`) hiện "đang chạy bằng cấu hình cũ" khi trường này `false`; nghĩa ấy vẫn đúng.

### Test phản chứng

`test/bo-sheet.test.mjs` (mới) chạy thật `background.js` với `chrome` và `fetch` giả. Máy giả mang những gì 1.5.1 để
lại (Sheet cũ trong cấu hình, Sheet do Hub gửi, `pendingLogs`, dấu lỗi gửi Sheet); Hub giả vẫn gửi `reviewSheet`.

- (b) "Quét review ngay": không lượt gọi nào tới `script.google.com` hay mang mã bí mật; một lô ingest Trip lên Hub,
  một lượt báo sống; Trip `ok`, `hub.ok`; Agoda `login`; `hubCollect` không giữ `reviewSheet`; `pendingLogs` không
  dài thêm; lỗi Agoda chỉ thành `lastError`.
- (a) quét một kênh thành công: kênh `ok`, `message` rỗng; dấu lỗi gửi Sheet cũ vẫn trong bộ nhớ mà huy hiệu rỗng.
- (c) lên bản (`onInstalled` `update`) với tệp mã `URB1.` cũ có Sheet: áp được, tên theo mã, thử Hub ổn; bộ nhớ không
  còn URL Sheet, mã bí mật, `pendingLogs`, `lastError` cũ.

Thêm: `test/setup-code.test.mjs` (mã v1 cũ có Sheet vẫn áp; cấu hình 1.5.1 còn `sheetUrl`/`secret` đọc ra là bỏ),
`test/review-hub.test.mjs` viết lại theo 1.5.2 (Hub `reviewSheet` bị bỏ qua, các hàm Sheet đã gỡ, `background.js`
không còn đường ghi Sheet, popup không còn chữ Sheet), `test/counter-problems.test.mjs` (không sinh
`REVIEW_SHEET_FAILED` kể cả khi còn dấu cũ).

### Đột biến (ĐO, chạy sau commit `701fae4`, `npm test`, phục hồi bằng `git checkout -- <tệp>`, cây sạch sau cùng)

| Đột biến | Kết quả |
|---|---|
| M1 `forgetSheet` không xoá dấu lỗi gửi Sheet | 306 pass, 1 fail (bo-sheet c) |
| M2 `DROPPED_KEYS` bỏ `sheetUrl`/`secret` | 304 pass, 3 fail |
| M3 `queueLog` lại xếp hàng `pendingLogs` | 306 pass, 1 fail (bo-sheet b) |
| M4 huy hiệu đọc dấu lỗi gửi Sheet (biến `sheetDown`) | 306 pass, 1 fail (dò chữ) |
| M4b như M4 nhưng không dùng tên `sheetDown` | 306 pass, 1 fail (bo-sheet a) |
| M5 `counterProblems` lại sinh `REVIEW_SHEET_FAILED` | 306 pass, 1 fail |
| M6 `parseHubSettings` lại giữ `reviewSheet` | 304 pass, 3 fail |
| M7 mã cài đặt lại đòi mã bí mật | 306 pass, 1 fail |
| M8 mã cài đặt lại chép `sheetUrl`/`secret` vào cấu hình | 304 pass, 3 fail |
| M9 lượt quét gọi `cfg.sheetUrl` | 305 pass, 2 fail (dò chữ, hạn giờ) |
| M9b lượt quét gọi Sheet theo cấu hình thô trong bộ nhớ | 304 pass, 3 fail (bo-sheet a, b) |
| M10 lên bản không chạy `forgetSheet` | 306 pass, 1 fail (bo-sheet c) |

M9 chỉ bị test dò chữ bắt vì `cfg` đã qua `withDefaults` nên `cfg.sheetUrl` luôn rỗng: lúc chạy, đột biến này không
gọi Sheet thật (SUY từ mã `loadConfig`).

## Chưa kiểm trên máy thật

- `windows/cai-dat.ps1`: Mac không có `pwsh`, chưa chạy thật trên Windows. Cần một lượt chạy trên máy KS có tên người
  dùng có dấu (thư mục ngắn kiểu `ANHRUA~1`) và xem chữ tiếng Việt trong cửa sổ.
- Extension 1.5.2 chưa nạp vào Chrome thật; chưa thấy ô bật lên, huy hiệu, màn Cài extension trên Hub với bản này.
- Không gọi Web App Sheet thật, không ghi Hub thật.

## Lệnh mọi máy phải chạy lại để lên 1.5.2

Trong Windows PowerShell trên máy KS (lệnh chung, không cần mã):

```powershell
irm https://raw.githubusercontent.com/taiituan13/UrbanB-Thu-review-OTA/main/windows/cai-dat.ps1 | iex
```

Chỉ có tác dụng sau khi nhánh này được merge và đẩy lên `main` (việc của phiên điều phối).

## Việc còn lại, ngoài phạm vi làn

1. **Vàng** `extension/report.js`: lỗi không thuộc kênh nào (lượt quét vỡ, giai đoạn `lượt quét`) vẫn xếp vào
   `SHEET_KINDS`, thường ra `SHEET-REJECT` với chữ "Bảng tính review từ chối bài". Lễ tân đọc sai nguyên nhân. Cần một
   nhóm loại riêng; `docs/ma-loi.md` đã ghi chỗ này là chữ cũ.
2. **Vàng** Máy chưa đăng nhập Hub lần nào mà trước đây chạy bằng Sheet cũ nay ngừng quét tới khi đăng nhập Hub.
   Vận hành nên rà danh sách máy trước khi phát hành.
3. **Trắng** Hub (repo UrbanB): khối Sheet review, trường `reviewSheet`/`reviewSheetReason` và mã
   `REVIEW_SHEET_FAILED` chỉ còn cho máy bản cũ; gỡ được khi mọi máy đã lên 1.5.2.
4. **Trắng** `apps-script/Code.gs`: hộp thoại Tạo lệnh cài vẫn đòi URL Web App và nhúng mã bí mật vào mã cài đặt,
   extension 1.5.2 bỏ qua cả hai.
5. **Trắng** Dọn nợ: `pushLimited` (`report.js`) chỉ còn test dùng; tham số `lastError` của `counterProblems` không
   còn sinh mã nào.
