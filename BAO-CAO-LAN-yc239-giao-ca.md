# Báo cáo làn `lane-yc239-ext-giao-ca` (YC-239, phía extension)

Nhánh `lane/yc239-giao-ca`, nền `main@ea22efe` (bản 1.5.3). Chưa merge, chưa push: push `main` là phát hành tới
mọi khách sạn, việc ấy do user duyệt.

## Commit

| Mục | Commit | Nội dung |
|---|---|---|
| ① | `c424dca` | Hợp đồng `ext:scan` trong `hub-bridge.js`, cổng tới service worker, lượt quét giao ca, test (a)(b)(c)(d)(e)(f)(g), `docs/hop-dong-hub-bridge.md` |
| ② | `fd7c517` | Test giữ manifest: `hub-bridge.js` chỉ nạp ở khung chính trên đúng `HUB_ORIGINS`, không `externally_connectable` |
| ③ | `c2b103f` | Bản 1.5.4 (`manifest.json`, `config.js`), `CHANGELOG.md`, dòng hợp đồng trong `README.md` và `CLAUDE.md` |

## Tệp đã sửa

- `extension/shift-scan.js` (mới): phần thuần — kiểm `requestId`, kiểm người gửi qua cổng, chọn cách gặp lượt
  đang chạy, dựng kết quả từng kênh từ danh sách trường cố định, theo dõi một lượt quét (`createScanRun`).
- `extension/background.js`: mọi lượt quét có một bản theo dõi (`current`); `scanOne` báo kết cục từng kênh;
  `chrome.runtime.onConnect` nhận cổng `urbanb-hub-scan`; `shiftScan` mở lượt, gắn vào lượt hay chờ.
- `extension/hub-bridge.js`: nhận `ext:scan`, mở cổng, chuyển tiến độ và đúng một kết quả về trang; hợp đồng đầy đủ
  ở đầu tệp. `ext:hello` / `ext:status` giữ nguyên từng dòng.
- `extension/hub.js`: `HUB_TRIGGER["giao ca"] = "manual"` (mã Hub đã biết; hợp đồng HTTP không đổi).
- `docs/hop-dong-hub-bridge.md` (mới), `CHANGELOG.md`, `README.md`, `CLAUDE.md`, `extension/manifest.json`,
  `extension/config.js`.
- Test: `test/giao-ca.test.mjs` (mới, 24 ca); `test/hub.test.mjs` (thêm mã `giao ca`); `test/bo-sheet.test.mjs` và
  `test/tab-quet.test.mjs` (giả `runtime.onConnect`, vì `background.js` nay nghe sự kiện ấy).

## Hợp đồng tóm tắt (bản đủ: `docs/hop-dong-hub-bridge.md`)

- Trang gửi `{ source: "urbanb-hub", type: "ext:scan", requestId }`, `requestId` 1–64 ký tự `[A-Za-z0-9_-]`; sai hay
  trùng một mã đang chờ ⇒ bỏ qua, không trả gì.
- Extension trả, mọi tin mang `source: "urbanb-ext"` và đúng `requestId`:
  - `ext:scan-accepted` `{ mode: "started" | "joined" | "queued", startedAt }`;
  - `ext:scan-progress` mỗi lần một kênh đổi trạng thái: `channel, label, state ("running" | "ok" | "error" | "login"),
    startedAt, finishedAt, count, code, ref, retryAt, what, why, steps`;
  - **đúng một** `ext:scan-result` `{ outcome ("done" | "not-configured" | "failed" | "interrupted"), startedAt,
    finishedAt, version, channels[], what, why, steps }`; mỗi kênh cùng dạng tiến độ, state thêm `"not-run"`.
    Chỉ `"ok"` là đạt.
- Lượt quét chồng: **gắn trang vào lượt mọi kênh đang chạy** (`joined`, kênh đã có trạng thái được gửi lại lúc gắn).
  Lượt đang chạy chỉ quét vài kênh ⇒ `queued`, chờ nó xong rồi mới mở lượt mọi kênh. Không bao giờ hai lượt cùng chạy.
- Tab quét bị đóng ⇒ kênh `error`, `code: "<KÊNH>-TAB"` ngay, kèm `retryAt`; lần đọc lại 2 phút của 1.5.3 vẫn hẹn.
- Gửi Hub hỏng ⇒ kênh `error`, `code: "HUB-…"` (cùng cách đọc với `ext:status`).
- Trang đóng giữa chừng ⇒ lượt chạy hết, vẫn gửi Hub. Kết quả gửi trang sau lượt báo sống lên Hub.
- Chỉ nhận cổng từ content script có tab, khung chính, gốc thuộc `HUB_ORIGINS` (Chrome cấp, không lấy từ tin). Tin gửi
  trang dựng từ danh sách khoá đóng, test liệt kê đủ.

## Test và đột biến

`npm test`: **355/355 xanh** (mốc trước làn 331; thêm đúng 24 ca của `giao-ca.test.mjs`; các tệp cũ giữ số ca, `hub.test.mjs` thêm một khẳng định trong ca sẵn có).
`giao-ca.test.mjs` chạy ba lần liền, không ca nào chập chờn.

Đột biến chạy **sau** commit `c2b103f`, mỗi lần sửa một chỗ rồi `npm test`, phục hồi bằng `git checkout -- <tệp>`.
Mọi đột biến đều đỏ:

| Đột biến | Ca đỏ |
|---|---|
| (a) service worker không gửi kết quả | 10 |
| (b) kênh luôn đạt | 3 |
| (c) service worker nhận mọi gốc | 2 |
| (c) bridge bỏ lọc `origin` | 2 |
| (d) luôn mở lượt mới | 5 |
| (d) lượt vài kênh cũng gắn vào | 3 |
| (e) tab đóng không báo ngay | 1 |
| (f) lộ câu lỗi thô (`message`) | 1 |
| (g) `ext:hello` không trả | 2 |
| ② manifest thêm một gốc | 2 |
| bridge mất kết nối mà im lặng | 1 |
| bridge gửi kết quả hai lần | 2 |
| bỏ mã `giao ca` ở `HUB_TRIGGER` | 2 |

Sau đột biến: `git status` sạch, `npm test` 355/355.

## Giả định làn tự đặt (lối an toàn nhất cho lễ tân)

1. **Lượt chồng: gắn vào, không báo bận.** Lễ tân bấm Quét lúc máy đang quét theo lịch thì nhận luôn kết quả của
   lượt ấy, không phải bấm lại. Lượt đang chạy chỉ quét một kênh thì không đủ cho giao ca, nên chờ nó xong rồi quét
   mọi kênh. Hệ quả: với `joined`, `startedAt` của lượt có thể sớm hơn lúc lễ tân bấm (tối đa bằng độ dài một lượt).
2. **Gửi Hub hỏng là chưa đạt** với giao ca, như `ext:status` đang đọc (review chưa lên Hub).
3. **Tab bị đóng lần đầu**: `ref` là `null` vì máy chưa ghi thành lỗi gần nhất (giữ hành vi 1.5.3); lời giải thích
   viết riêng (`tabClosedHelp`), vì lời của mã `TAB` trong `report.js` nói "đã tự đọc lại mà vẫn bị đóng", sai với
   lần đầu.
4. **Chi nhánh không bật kênh nào** ⇒ `outcome: "done"`, `channels: []`. Extension không phán có cho giao hay không;
   trang Hub quyết (luật nghiệp vụ không có trong PROMPT-LAN).
5. **Không có cờ `allOk`** trong kết quả: trang tính từ `channels` để chỉ có một nguồn sự thật.
6. **Lượt giao ca gửi Hub với `run.trigger = "manual"`** (người bấm), không thêm mã mới mà Hub chưa biết.
7. **`ext:scan-accepted`** là tin thêm ngoài hai tin PROMPT-LAN nêu, để trang biết lệnh đã được nhận và đang gắn hay chờ.
8. **`outcome: "interrupted"`** do `hub-bridge.js` tự gửi khi mất cổng trước khi có kết quả (extension nạp lại, lên
   bản), để trang không chờ mãi và vẫn nhận đúng một kết quả.

## Chưa kiểm được trên Chrome thật

Mọi test chạy với `chrome` giả. Chưa đo trên Chrome thật:

- vòng đời cổng `chrome.runtime.connect` giữa content script và service worker trong lượt quét dài nhiều phút, và
  khi trang tải lại hay đóng giữa chừng;
- `port.sender.origin` / `frameId` Chrome cấp thật cho content script trên `hub.urbanb.vn`;
- service worker có bị Chrome cho ngủ lúc trang đang `queued` hay không (suy: không, vì cổng còn mở và lượt quét
  đang gọi API Chrome).

Đề xuất nghiệm thu khi trang Hub đã có: trên một máy quầy lên 1.5.4, mở trang Giao ca, bấm Quét, đóng thử một tab
quét, tải lại trang giữa chừng.

## Lệnh mọi máy phải chạy lại

Sau khi user duyệt push `main`, mỗi máy quầy chạy lại lệnh cài để lên 1.5.4 (lệnh ở `docs/cai-tu-xa.md` mục Cập
nhật, cũng là `UPDATE_COMMAND` trong `extension/update.js`). Máy chưa lên bản vẫn chạy bình thường nhưng không trả
lời `ext:scan`; trang Hub nhận ra qua `document.documentElement.dataset.urbanbExt` nhỏ hơn `1.5.4`.
