# Hợp đồng giữa trang Hub và extension (`hub-bridge.js`)

Tài liệu cho làn dựng trang Hub (repo UrbanB). Extension giữ hợp đồng này ở đầu `extension/hub-bridge.js`;
hai bản phải khớp nhau. Đổi gì phải báo phiên điều phối trước, vì máy khách sạn chạy bản cũ tới khi có
người chạy lại lệnh cài.

| Phần | Có từ bản | Yêu cầu |
|---|---|---|
| `ext:hello` / `ext:status` | 1.2.x | YC-156 |
| `ext:scan` (quét trước khi giao ca) | 1.5.4 | YC-239, H-1996 a, H-1976 c |

## Chung

- `hub-bridge.js` là content script, chỉ nạp ở khung chính trên các gốc Hub mà `manifest.json` khai:
  `https://hub.urbanb.vn/*` và `https://urbanb.xyz/*` (đúng danh sách `HUB_ORIGINS` trong `extension/env.js`,
  có test giữ). Trang ở gốc khác không nói chuyện được với extension.
- Nạp xong, nó đặt `document.documentElement.dataset.urbanbExt = "<phiên bản>"` (ví dụ `"1.5.4"`). Trang dựa
  vào dấu này để biết máy đã cài extension, và phiên bản nào. `ext:scan` cần bản **1.5.4 trở lên**: bản cũ hơn
  im lặng bỏ qua tin này, trang phải tự báo "máy cần lên bản".
- Trang gửi tin bằng `window.postMessage({ source: "urbanb-hub", type, … }, location.origin)`.
- Extension chỉ nhận tin có `event.source === window`, `event.origin === location.origin` và
  `data.source === "urbanb-hub"`. Tin gửi trang đều qua `window.postMessage(…, location.origin)` và mang
  `source: "urbanb-ext"`.
- Service worker kiểm lại người gửi bằng thông tin Chrome cấp (tab, khung chính, gốc trong `HUB_ORIGINS`),
  không tin gốc ghi trong tin.
- Không tin nào gửi trang có token, mã bí mật, URL Sheet, email, mã kết nối OTA hay câu lỗi thô (câu lỗi thô
  có thể mang đường dẫn trang kênh). Lời giải thích lỗi lấy từ danh mục mã lỗi (`extension/report.js`,
  `docs/ma-loi.md`).
- Tên trường viết tiếng Anh. Giờ là chuỗi ISO 8601 theo UTC (`"2026-10-26T03:17:00.000Z"`); trang tự đổi
  sang giờ Việt Nam khi hiện.

## Trạng thái máy: `ext:hello` → `ext:status`

Không đổi ở 1.5.4.

- Trang gửi `{ source: "urbanb-hub", type: "ext:hello" }`.
- Extension trả `{ source: "urbanb-ext", type: "ext:status", status }`, cả lúc vừa nạp mà không chờ hỏi.
  `status` theo `extension/quay/hub-quay.js` `extStatusOf`.
- Trang ở màn Cài extension (`/extension`) thì máy theo Hub của trang ấy và đồng bộ ngay (H-1526 a).

## Quét trước khi giao ca: `ext:scan`

### Trang gửi

```js
window.postMessage({ source: "urbanb-hub", type: "ext:scan", requestId: "gc-7f3a9c" }, location.origin);
```

- `requestId`: chuỗi 1–64 ký tự, chỉ gồm `A–Z a–z 0–9 - _`, do trang sinh, mỗi lần bấm Quét một mã mới.
- Sai kiểu, quá dài, có ký tự khác, hoặc trùng một `requestId` đang chờ kết quả trên cùng trang ⇒ extension
  bỏ qua, **không trả gì**.

### Extension làm gì

- Chạy một lượt quét **mọi kênh máy này đang quét** (kênh bật theo cấu hình Hub của chi nhánh).
- Lượt quét giao ca **không bao giờ chạy chồng** lên lượt đang chạy (lượt hẹn giờ, lượt lễ tân bấm ở ô bật lên
  hay ở khung trên PMS, lượt giao ca của trang khác):
  - không có lượt nào chạy ⇒ mở lượt mới (`mode: "started"`);
  - đang có lượt quét mọi kênh ⇒ **gắn trang vào lượt ấy** (`mode: "joined"`), không mở lượt thứ hai. Kênh đã
    có trạng thái trước lúc gắn được gửi lại ngay dưới dạng `ext:scan-progress`;
  - đang có lượt chỉ quét một vài kênh (nút Quét lại kênh này, tự quét lại sau khi đăng nhập, đọc lại sau khi
    tab bị đóng) ⇒ trang được báo `mode: "queued"`, chờ lượt ấy xong rồi mới mở lượt mọi kênh (hoặc gắn vào lượt
    mọi kênh khác vừa kịp bắt đầu). Khi chạy, trang nhận thêm một `ext:scan-accepted` mang `"started"` hoặc
    `"joined"`.
- Lượt quét giao ca gửi review lên Hub và báo sống (`POST /api/extension/connection`) như mọi lượt quét khác,
  với `run.trigger = "manual"`. Hợp đồng HTTP với Hub không đổi.
- Trang đóng hay tải lại giữa chừng ⇒ lượt quét vẫn chạy hết, vẫn gửi Hub; chỉ là không còn ai nhận tin.
- Kết quả gửi trang **sau** lượt báo sống lên Hub: trang nhận kết quả thì Hub cũng đã có trạng thái lượt này.

### Extension trả

Ba loại tin, mọi tin mang `source: "urbanb-ext"` và đúng `requestId` của trang.

#### `ext:scan-accepted`

```json
{ "source": "urbanb-ext", "type": "ext:scan-accepted", "requestId": "gc-7f3a9c", "mode": "started", "startedAt": "2026-10-26T03:17:00.000Z" }
```

| Trường | Giá trị |
|---|---|
| `mode` | `"started"` · `"joined"` · `"queued"` |
| `startedAt` | giờ lượt quét bắt đầu; `null` khi `"queued"` |

#### `ext:scan-progress`

Mỗi lần một kênh đổi trạng thái: bắt đầu quét, xong, lỗi.

```json
{ "source": "urbanb-ext", "type": "ext:scan-progress", "requestId": "gc-7f3a9c",
  "channel": "trip", "label": "Trip", "state": "running", "startedAt": "2026-10-26T03:17:02.000Z", "finishedAt": null,
  "count": null, "code": null, "ref": null, "retryAt": null, "what": null, "why": null, "steps": [] }
```

Các trường giống hệt một phần tử của `channels` trong `ext:scan-result` (bảng dưới), cộng `state: "running"`
lúc kênh đang quét.

#### `ext:scan-result`

**Đúng một tin** cho mỗi `requestId` extension đã nhận.

```json
{ "source": "urbanb-ext", "type": "ext:scan-result", "requestId": "gc-7f3a9c",
  "outcome": "done", "startedAt": "2026-10-26T03:17:00.000Z", "finishedAt": "2026-10-26T03:18:40.000Z", "version": "1.5.4",
  "channels": [
    { "channel": "booking", "label": "Booking", "state": "ok", "startedAt": "…", "finishedAt": "…",
      "count": 12, "code": null, "ref": null, "retryAt": null, "what": null, "why": null, "steps": [] },
    { "channel": "trip", "label": "Trip", "state": "error", "startedAt": "…", "finishedAt": "…",
      "count": null, "code": "TRP-TAB", "ref": null, "retryAt": "2026-10-26T03:20:05.000Z",
      "what": "Tab Trip bị đóng khi máy đang đọc review.", "why": "…", "steps": ["…"] }
  ],
  "what": null, "why": null, "steps": [] }
```

| Trường | Ý nghĩa |
|---|---|
| `outcome` | `"done"`: đã đi hết các kênh, trạng thái thật từng kênh nằm trong `channels`. `"not-configured"`: máy chưa đủ cấu hình thu review (chưa biết chi nhánh), không quét kênh nào; `channels` rỗng, lời hướng dẫn ở `what`/`why`/`steps` cấp ngoài. `"failed"`: lượt quét hỏng giữa chừng; kênh chưa tới mang `state: "not-run"`. `"interrupted"`: mất kết nối với extension trước khi có kết quả (extension nạp lại hay lên bản giữa chừng); `channels` rỗng, `startedAt` là `null`. |
| `startedAt`, `finishedAt` | giờ lượt quét bắt đầu và xong. Trang gắn vào lượt đang chạy (`joined`) thì `startedAt` có thể sớm hơn lúc lễ tân bấm. |
| `version` | phiên bản extension. |
| `channels` | các kênh của lượt, theo thứ tự quét. Mảng rỗng với `outcome: "done"` nghĩa là chi nhánh không bật kênh nào. |
| `what`, `why`, `steps` | chỉ có giá trị khi `outcome: "not-configured"`. |

Mỗi phần tử `channels` (và mỗi `ext:scan-progress`):

| Trường | Ý nghĩa |
|---|---|
| `channel` | `"booking"` · `"agoda"` · `"trip"` · `"expedia"` · `"traveloka"` · `"go2joy"` |
| `label` | tên kênh để hiện: Booking, Agoda, Trip, Expedia, Traveloka, Go2Joy |
| `state` | `"ok"` đạt (đọc xong và review đã lên Hub) · `"error"` lỗi · `"login"` cần đăng nhập lại trang kênh · `"not-run"` lượt dừng trước khi tới kênh này · `"running"` đang quét (chỉ trong `ext:scan-progress`). **Chỉ `"ok"` là đạt.** |
| `startedAt`, `finishedAt` | giờ kênh bắt đầu và xong quét |
| `count` | số bài đọc được ở lượt này; `null` khi không có |
| `code` | loại lỗi theo `report.js` / `docs/ma-loi.md`, ví dụ `BKG-LOGIN`, `TRP-TAB`, `AGD-HTTP`, `HUB-NET`; `null` khi đạt |
| `ref` | mã tham chiếu `E-XXXXXX` của lần lỗi (lễ tân đọc cho người sửa, tra ở lỗi gần nhất trên máy); `null` khi đạt hoặc khi chưa thành lỗi trên máy (tab bị đóng lần đầu) |
| `retryAt` | chỉ có khi tab quét bị đóng: giờ máy sẽ tự đọc lại kênh ấy |
| `what`, `why`, `steps` | lời giải thích ba phần cho lễ tân (chuyện gì, vì sao, làm gì tiếp) |

Ghi chú về trạng thái kênh:

- **Đọc được nhưng gửi Hub hỏng** ⇒ `state: "error"`, `code` dạng `HUB-…`: review chưa lên Hub thì với giao ca là
  chưa đạt. Đây cũng là cách đọc của `ext:status`.
- **Tab quét bị đóng giữa chừng** ⇒ lượt giao ca báo ngay `state: "error"`, `code: "<KÊNH>-TAB"`, kèm `retryAt`,
  không chờ lần đọc lại. Lần đọc lại 2 phút sau (H-1973 a, bản 1.5.3) máy vẫn tự hẹn như cũ; với máy, lần đóng
  đầu chưa thành lỗi đỏ nên `ref` là `null`.
- Cách đọc trạng thái này là phép đọc thật từng kênh. Cờ `ok` mà nút Quét review ngay nhận (`scanNow`) **không**
  dùng được cho giao ca: nó vẫn là `ok` khi có kênh lỗi.

### Gợi ý cho trang Hub

- Mọi kênh `state: "ok"` (và `outcome: "done"`) mới cho giao (H-1976 c). Kênh lỗi thì hiện `what`/`steps`, cho
  lễ tân **Quét lại** (gửi `ext:scan` với `requestId` mới) hoặc **Giao kèm lỗi**.
- Không thấy `dataset.urbanbExt`, hay phiên bản nhỏ hơn 1.5.4 ⇒ báo máy cần cài hay lên bản extension; đừng chờ
  kết quả.
- Lượt quét đi qua từng kênh nối nhau, mỗi kênh có thể mất cả phút. Trang nên hiện tiến độ từ
  `ext:scan-progress`, không nên tự đặt hạn ngắn rồi coi là lỗi.
