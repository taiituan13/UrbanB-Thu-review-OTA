# Báo cáo làn yc238-tab-quet (repo urbanb-reviews)

YC-238 · H-1972 a · H-1973 a. Nhánh `lane/yc238-tab-quet`, tách từ `fcc8fbc` (bản 1.5.2). Chưa push, chưa merge,
chưa chạy trên Chrome thật.

| sha | Nội dung |
|---|---|
| `c7da1ae` | Mục ①: quyền `tabGroups`, tab quét vào nhóm "Urban B · đang đọc review", dải chữ đầu trang |
| `f32b8cc` | Mục ②: tab bị đóng lần đầu thì chưa đỏ, đọc lại kênh ấy một lần sau 2 phút (`chrome.alarms`) |
| `00f3d28` | Mục ③: khung quầy trên PMS báo một dòng; lời giải thích mã `TAB` mới; `docs/ma-loi.md` |
| `8e6abbe` | Mục ④: bản 1.5.3 (`manifest.json`, `config.js`), CHANGELOG, `docs/cai-dat.md` |
| `707b5e3` | Test thêm: tab bị đóng lúc bộ quét đang chạy (đột biến M19 từng sống) |
| (commit này) | Báo cáo làn |

`npm test` (ĐO, sau `707b5e3`): 331 tests, 331 pass, 0 fail. Mốc trước làn 307/307.

## ① Nhóm tab và dải chữ

- `extension/tab-scan.js` (mới, phần thuần): `SCAN_GROUP` (tên "Urban B · đang đọc review", màu `blue`),
  `BANNER_TEXT`, `pickScanGroup`, `showScanBanner` (chạy trong trang: `position:fixed; top:0`,
  `pointer-events:none`, gắn vào `<html>`, gọi lại không thêm dải thứ hai), `BANNER_TIMEOUT_MS`.
- `extension/background.js`:
  - `joinScanGroup(tab)`: tìm nhóm cùng tên trong cửa sổ của tab (`chrome.tabGroups.query`), có thì vào nhóm ấy,
    không thì tạo nhóm rồi đặt tên, màu. Lỗi gì cũng bỏ qua.
  - Tab của kênh trước chỉ đóng sau khi tab kênh kế tiếp đã vào nhóm (`scanOne` nhận `leftover`, trả mã tab của
    mình; `runScan` đóng tab cuối trong `finally`). Nhờ vậy cả lượt quét dùng một nhóm: nhóm rỗng thì Chrome tự
    bỏ, nên đóng trước rồi mới mở là mỗi kênh một nhóm mới.
  - `showBanner(tabId)` gọi trong `go()` sau mỗi lượt mở trang (chuyển trang là mất dải), hạn 5 giây, lỗi bỏ qua.
  - `active: false` giữ nguyên.
- `extension/manifest.json`: thêm quyền `tabGroups`.

## ② Đọc lại một lần sau 2 phút

- Trạng thái chờ: `chrome.storage.local` khoá `tabRetry` (`TAB_RETRY_KEY` ở `quay/review-status.js`, để khung quầy
  đọc được): `{ [kênh]: { closedAt, retryAt } }`. Báo thức `tabRetry:<kênh>`, `when` = giờ đóng + 2 phút
  (`TAB_RETRY_MINUTES` ở `tab-scan.js`).
- `scanOne` nghe `chrome.tabs.onRemoved` cho đúng tab của mình. Lỗi được coi là tab bị đóng khi mã là `TAB`, hoặc tab
  đã bị đóng mà câu lỗi ra loại khác (vd. bộ quét trả rỗng ⇒ "chuyển sang trang khác"): khi ấy dòng lỗi được đổi thành
  câu `TAB_CLOSED_MESSAGE`. Cần đăng nhập lại không bao giờ đọc lại.
- `closedOutcome` (thuần): bị đóng và kênh chưa chờ ⇒ hẹn; kênh đang chờ (lượt này là lần đọc lại) ⇒ báo như cũ.
  Lượt nào đọc kênh đang chờ (báo thức, bấm tay, hẹn giờ) cũng là lần đọc lại và xoá trạng thái chờ khi xong.
- `retryClosedTab`: tới giờ mà kênh hết chờ thì thôi; đang có lượt khác chạy thì lùi 1 phút
  (`TAB_RETRY_BUSY_MINUTES`); kênh không được quét (tắt, thiếu cấu hình) thì bỏ hẹn.
- `rearmTabRetries` chạy lúc `onInstalled`/`onStartup`: Chrome bỏ báo thức khi extension nạp lại, nên kênh còn chờ được
  hẹn lại (giờ đã qua thì sau 1 phút).
- Hợp đồng Hub không đổi: `HUB_TRIGGER` thêm "đọc lại sau khi tab bị đóng" ⇒ `schedule` (mã Hub đã nhận). `tabRetry`
  không vào `hubChannels`, `heartbeatChannels`, lô ingest. Không có câu hỏi nào phải gửi điều phối.

## ③ Khung quầy

- `quay/review-status.js`: `reviewStatusModel` nhận thêm `retries` ⇒ `model.retries` (chỉ kênh đang bật); không tính
  vào `bad`. `tabRetryText`: "Bạn vừa đóng tab Trip lúc máy đang đọc review. Máy sẽ đọc lại lúc 10:19." (tới giờ mà
  chưa xong: "Máy đang đọc lại kênh này.").
- `quay/review-ui.js`: dòng `qban warn rv-retry` trên đầu khối Thu review, ở cả trạng thái ổn và có lỗi.
  `reviewProblemCount` không đổi (chờ đọc lại không phải việc phải xử lý).
- `quay/sw.js`: `quay:review` đọc `tabRetry`. `quay/ui.js`: vẽ lại khi `tabRetry` đổi; kênh mới vào chờ thì
  đặt `S.note` (tone `warn`, 10 giây) để khung đang gập cũng thấy câu ấy.
- `report.js`: mã `TAB` nay nói máy đã tự đọc lại sau 2 phút mà tab vẫn bị đóng, chỉ chỗ nhóm tab xanh và dải chữ xanh.
  Không dùng ký tự "·" trong lời hướng dẫn (luật test YC-158), nên lời ấy gọi là "nhóm tab màu xanh có chữ Urban B".

## Test và đột biến

Tệp mới `test/tab-quet.test.mjs` chạy thật `background.js` với `chrome` giả (tab, nhóm tab, báo thức, chèn script),
24 ca. Ca theo PROMPT-LAN: (a) đóng lần đầu ⇒ không đỏ, hẹn đúng 2 phút; đóng lúc bộ quét chạy cũng thế · (b) đọc lại
cũng bị đóng ⇒ đỏ `TRP-TAB` · (c) đọc lại đạt ⇒ `ok`, lô ingest mang `trigger: schedule`, không gửi `tabRetry` · (d) chỉ
đọc lại một lần, lượt thường trước giờ hẹn là lần đọc lại · (e) API nhóm tab và chèn dải chữ ném lỗi ⇒ hai kênh vẫn
`ok` · (f) lỗi HTTP và cần đăng nhập ⇒ không hẹn. Thêm: lùi khi đang bận, hẹn lại sau khi nạp lại, khung quầy.

Sửa test cũ: `test/review-hub.test.mjs` (regex gọi `scanOne` cho phép thêm đối số), `test/hub.test.mjs` (`HUB_TRIGGER`
có thêm một khoá, vẫn chỉ hai mã `manual`/`schedule`).

Đột biến (ĐO, sau commit, `npm test`, phục hồi bằng `git checkout -- <tệp>`, script ở scratchpad của phiên): 19 đột
biến, cả 19 đỏ. M1 đọc lại không giới hạn · M2 không hẹn · M3 hẹn 0 phút · M4 không xoá chờ sau lần đọc lại · M5 lỗi
nhóm tab ném ra · M6 lỗi dải chữ ném ra · M7 đóng tab cũ trước khi vào nhóm · M8 bỏ `pointer-events:none` · M9 không chèn
dải chữ · M10 không vào nhóm · M11 lỗi nào cũng đọc lại · M12 khung không nghe `tabRetry` · M13 lời `TAB` cũ · M14 không
lùi khi bận · M15 không hẹn lại khi nạp · M16 chờ đọc lại tính là lỗi · M17 không có dòng trên khung · M18 `quay:review`
không đọc `tabRetry` · M19 đóng tab ngoài câu TAB không thành TAB (lúc đầu sống, thêm test ở `707b5e3` thì đỏ).

## Chưa kiểm được (SUY, cần Chrome thật)

- Nhóm tab hiện đúng tên, màu trên thanh tab Chrome Windows; tab vẫn mở nền, không giật tiêu điểm khi vào nhóm.
- Dải chữ hiện trên từng extranet (Booking, Agoda, Trip, Expedia, Traveloka, Go2Joy) và không làm bộ quét hỏng. Bộ
  quét đọc qua fetch trong trang và `querySelectorAll('a[href*="htid="]')` của Expedia; dải chữ nằm ngoài `<body>`.
- Trang có CSP chặt hay trang lỗi của Chrome: chèn hỏng thì bỏ qua (đã test bằng chrome giả).
- Lên 1.5.3, extension giải nén nạp lại có tự nhận quyền `tabGroups` không. SUY: bản giải nén thì Chrome cấp quyền mới
  khi nạp lại, không tắt extension như bản từ Cửa hàng; `tabGroups` không có lời cảnh báo quyền.
- Đóng tab thật giữa chừng ⇒ khung quầy hiện dòng, 2 phút sau tab mở lại và kênh xanh.
- Báo thức một lần `when` sau khi service worker ngủ.

## Lệnh mọi máy phải chạy lại

Không có lệnh mới. Mỗi máy chỉ cần lên bản 1.5.3 như mọi lần (chạy lại lệnh cài Windows, `UPDATE_COMMAND` trong
`docs/cai-tu-xa.md`), sau khi user duyệt push `main`. 19 máy production đang ở 1.5.1.
