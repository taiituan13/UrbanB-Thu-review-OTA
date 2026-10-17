# Báo cáo làn `lane-yc112-extension-v2` — extension *UrbanB tại quầy* bản 2 (17/10/2026)

Repo `urbanb-reviews`, worktree `urbanb-reviews-yc112-v2`, nhánh `yc112-extension-v2`, nền `main@b9dad22`.
Không ghi vào repo UrbanB (Hub) hay `ezcloud-ota-booking-sync`; hai repo ấy chỉ được đọc.

Nhãn: **ĐO** = đo trên máy (lệnh, tệp, số). **SUY** = suy luận, cần người hoặc lượt thử thật xác nhận.

## 1. P4 — extension gọi route Hub bằng phiên đăng nhập được không

**Kết luận: được, không cần mã kết nối riêng cho máy quầy.** Điều kiện là mọi lượt gọi Hub phải đi từ
service worker của extension, và manifest phải có `host_permissions` cho tên miền Hub.

### Cách đo

Lúc đo không có dev server Hub nào chạy (đo cổng 3000–3010: không trả lời; tiến trình node duy nhất là
bảng điều phối ở cổng 3230). Làn không tự mở dev server của repo chính: việc đó ghi `.next/` vào cây Hub,
mà luật làn cấm ghi vào cây ấy. Phép đo vì vậy tách làm hai nửa:

1. **Cơ chế Chrome (ĐO).** Một máy chủ giả đặt cookie đúng thuộc tính mặc định của Better Auth
   (`node_modules/better-auth/dist/cookies/index.mjs:30–36`: `httpOnly`, `sameSite: "lax"`, `path: "/"`, thêm
   `secure` và tiền tố `__Secure-` khi Hub chạy https). `src/lib/auth.ts` của Hub không đổi thuộc tính nào
   (không có `defaultCookieAttributes` hay `cookies`). Hai extension thử được nạp vào Chromium 1243 của
   Playwright 1.63, một bản có `host_permissions` cho máy chủ ấy và một bản không có. Trình duyệt "đăng
   nhập" bằng cách mở trang đặt cookie ở tab thường, rồi service worker gọi `fetch`.
   Mã đo nằm ở `tools/do-p4-cookie/`, kết quả thô ở `tools/do-p4-cookie/ket-qua-17-10-2026.json`.
2. **Phía Hub (SUY, đọc mã ở `UrbanB dev@73aada648`).** Kiểm từng hàng rào mà request của extension phải qua.

### Kết quả đo

| Lượt gọi | Có `host_permissions` | Không có `host_permissions` |
|---|---|---|
| Service worker `GET`, `credentials` mặc định | 200, **mang cả hai cookie** | `Failed to fetch` |
| Service worker `GET`, `credentials: "include"` | 200, mang cả hai cookie | `Failed to fetch` |
| Service worker `POST` | 200, mang cả hai cookie; `Origin: chrome-extension://<32 chữ a–p>` | `Failed to fetch` |
| Content script trên trang khác nguồn (giống trang PMS) | `Failed to fetch` (CORS) | `Failed to fetch` |

- Header của mọi lượt từ service worker: `Sec-Fetch-Site: none`, `Sec-Fetch-Mode: cors`. `GET` không có
  `Origin`, còn `POST` có `Origin` là origin của extension.
- Thêm một lượt có đặt tuỳ chọn chặn cookie bên thứ ba (`profile.cookie_controls_mode = 1`) vào hồ sơ
  trước khi mở: kết quả y hệt, cookie vẫn đi theo. **SUY:** chưa chứng minh được tuỳ chọn ấy đã có hiệu
  lực trong hồ sơ Playwright, nên không coi đây là bằng chứng cho máy quầy đặt chặn cookie bên thứ ba.

### Đối chiếu với hàng rào của Hub (SUY, đọc mã)

- `GET /api/extension/connection` và `GET /api/extension/indicators` chỉ gọi `getSession()` (đọc cookie)
  rồi `authorizeBranches`. Hai route này không kiểm origin. Proxy cũng không chặn, vì cả hai đã được loại
  khỏi `matcher` (`src/proxy.ts:428`).
- `connection` có tham số `report=…` thì phải qua `extensionWriteAllowed`. Hàm này gọi
  `isCrossOriginForbidden` với method `POST`, mà `Sec-Fetch-Site: none` được nhận (`src/lib/origin-guard.ts:38–42`)
  ⇒ cho qua.
- Lượt `POST /api/ingest/reviews` không có header `Authorization` đi đường phiên. `Origin` khớp mẫu
  `^chrome-extension://[a-p]{32}$` (`access.rules.ts:61`) ⇒ cho qua.
- **Hệ quả cho thiết kế:** content script trên PMS không gọi Hub được (CORS). Mọi lượt gọi Hub và Apps
  Script đều đi qua service worker; khung trên PMS chỉ nhắn tin cho service worker.

### Phần chưa đo được

- Chưa có lượt nào chạy với Hub thật (dev server + Better Auth thật + một phiên dev-login). Muốn chốt
  hẳn thì cần một dev server Hub. Lệnh thử nằm ở mục *Việc ra ngoài*.
- Chrome thật ở máy quầy (bản Chrome, chính sách doanh nghiệp, tuỳ chọn cookie) chưa được đo.

## 2. Đã dựng gì

Extension đổi tên thành **UrbanB tại quầy**, bản `1.0.0` (manifest và `config.js`).

| Phần | Tệp | Nguồn dữ liệu |
|---|---|---|
| Nút gập góc phải dưới: số booking lỗi và chấm mức chỉ báo, không tự mở (H-1246 a) | `quay/ui.js`, `quay/hub-quay.js § dockModel` | Apps Script + Hub |
| Khung 560px, ba tab theo thứ tự Booking OTA · Khoá G2J · Chỉ báo | `quay/ui.js`, `quay/ui-css.js` | |
| Booking OTA, Khoá G2J: chuyển từ userscript 3.2.0, gọi đúng API Apps Script (`recent`, `q`, `action=board`, `action=lockG2J`, POST `pushToken`) | `quay/booking-ota.js` (thuần), `quay/sw.js` | Apps Script **thật** của khách sạn, mã kết nối lấy từ Hub |
| Bắt token ezCloud/Go2Joy: `capture.js` (MAIN) → `bridge.js` (ISOLATED) → service worker | `capture.js`, `bridge.js` | trang PMS / HA Go2Joy |
| Mã khách sạn ezCloud của PMS đang mở: claim `HotelId` trong JWT | `booking-ota.js § ezcloudHotelIdOf` | token PMS |
| Tab Chỉ báo | `quay/indicators.js` | route Hub **thật** `GET /api/extension/indicators` |
| Bản đệm tại chỗ: mã kết nối (dùng lại 30 phút), booking, bảng khoá, chỉ báo | `quay/sw.js` (`chrome.storage.local`) | |
| Hết phiên Hub (H-1245 a): Booking OTA và Khoá G2J chạy bằng mã đã nhận; chỉ báo và thông báo dừng | `hub-quay.js § sessionState, blockedNote` | |
| Thông báo: chip, danh sách trong khung, Đã đọc, thông báo nổi, ghim | `quay/notifications.js` (thuần), `quay/ui-notify.js` | **hợp đồng giả** (mục 4) |
| Popup hai mục *Khung trên PMS* · *Thu review OTA*; dải nhắc tắt Tampermonkey; ô chọn Hub | `popup.html`, `popup.js`, `popup-model.js` | |
| Huy hiệu icon Chrome: số chưa đọc (H-1264 a), không có thì `!` khi máy cần xem | `background.js`, `notifications.js § badgeText` | |
| Đổi chữ "OTA Sync" → "Booking OTA" (H-1265 a) + cổng giữ | `test/ten-goi.test.mjs` | |

Thu review 0.9.0 giữ nguyên (`background.js`, `scanners/`, Sheet + token Hub cũ).

### Chạy thật và bản giả

- **Chạy thật** (gọi đúng đích khi cài lên máy): hai route Hub `connection` và `indicators`; Apps Script
  của khách sạn; thu review 0.9.0.
- **Bản giả**: chỉ phần thông báo. Hub chưa có route; extension gọi `GET /api/extension/notifications`,
  Hub trả 404 không JSON ⇒ **ẩn cả tính năng** (không chip, không nút, không dòng trong popup). Nguồn giả
  (`fakeSource`) chỉ bật khi `env.js § DEV_FLAGS.fakeNotifications = true`, tức trong bản dựng đo.
- **Không dựng**: mức Cảnh báo/Chú ý của từng tình huống. Đó là luật của Hub (`situationLevel` →
  `itemLevelOf`, Hub ghi rõ không dựng bảng mức thứ hai). Route hiện chưa trả mức ⇒ extension chỉ nhận ra
  *Đặt vượt quỹ* (`status = vuot` và `reason = over-capacity`), còn lại chấm trung tính. Khi route trả
  `display.mark` thì chấm đổi màu theo, không phải sửa extension.
- **Không còn trong popup**: nút *Đăng xuất* của mockup. Đăng xuất Better Auth từ origin extension bị
  hàng rào origin của Hub chặn (SUY, đọc mã), và đăng xuất trên Hub ở tab thường là đủ.

## 3. Kiểm thử

### Unit test (ĐO)

`npm test` (`node --test test/*.test.mjs`): **144/144 xanh**. Tệp mới: `booking-ota`, `hub-quay`, `indicators`,
`notifications`, `popup-model`, `ten-goi`; `capture.test.mjs` thêm 4 ca bắt token PMS/Go2Joy.

Counter-test bằng đột biến trên mã đã commit (sửa một dòng, chạy cả bộ, trả lại bằng `git checkout`):
**10/10 đột biến làm đỏ** ít nhất một ca. Gồm: tự suy mức chỉ báo khi Hub không trả · bỏ phân biệt hết
phiên / chưa đăng nhập (H-1245 a) · báo Hub "accepted" khi máy khác đặt dấu từ chối · bỏ bộ nhớ 10 phút
của token · nhận `HotelId` không phải số · gửi lại token trùng · nhận token từ request không phải `/api/` ·
đếm tình huống đã xử lý là đang vượt · chặn khung khi có bản đệm · tính kênh đã tắt vào thu review.

### Đo giao diện bằng Playwright (ĐO)

Bản dựng đo `tools/do-quay/` (chép `extension/`, `env.js` trỏ Hub giả + Apps Script giả ở localhost, bật
nguồn thông báo giả, chu kỳ hỏi thông báo 2 giây). Trang PMS giả lập 1440×900 ở đúng
`https://pms.ezcloudhotel.com/` (Playwright `route`), gửi một request `/api/…` mang JWT có claim `HotelId`.
Kết quả thô: `tools/do-quay/ket-qua-17-10-2026.json`.

| Mục | Số đo | Mockup |
|---|---|---|
| Khung | 560×720 tại x862 y108 | x862 y108 |
| Nút gập | 416×44 tại x1006 y838 | |
| Chip thông báo | 139×38 tại x857 y841 | 141×38 tại x859 y841 |
| Thông báo nổi | 460×36 tại x490 y6, đáy y42; **0 phần tử PMS bị đè** | rộng 460, top 6 |
| Tràn ngang trang | `scrollWidth` 1440 = `clientWidth` 1440 ở mọi trạng thái | |
| Tràn ngang thân khung | 558 = 558 ở cả ba tab và danh sách thông báo | |
| Popup | `scrollWidth` 360 = 360 ở năm trạng thái | |
| Lỗi console | **0** ở cả bốn hồ sơ (trang PMS + popup) | |

Bảng khoá 14 ngày cuộn ngang **bên trong** ô `.ota-scroll` (609 trên 534), giống userscript 3.2.0.

Hành vi đo được:
- Đủ dữ liệu: nút gập đọc *Booking 2 lỗi · Chỉ báo 3 đang vượt*; Đặt vượt quỹ đứng đầu tab Chỉ báo; Khoá
  G2J trên booking UrbanB chưa thanh toán hỏi xác nhận rồi hiện dải *G2J LOCKED* trong tab.
- Thông báo: lần đầu trên máy không bắn nổi (0). Bắn mới: rê chuột 10 giây vẫn còn; rời chuột 9,5 giây thì
  tự ẩn; số trên chip **giữ nguyên** sau khi nổi tự ẩn hay bị đóng. Thông báo ghim: không có thanh đếm, còn
  sau 10 giây, đóng bằng ×. Bấm Đã đọc: chip 2 → 1.
- Hết phiên (đổi Hub giả sang 401 rồi tải lại PMS): Booking OTA vẫn hiện 4 booking từ bản đệm, tab Chỉ báo
  hiện *Phiên đăng nhập Hub đã hết*, popup hiện dải hết phiên, huy hiệu `!`.
- Chưa đăng nhập: khung chỉ có khối *Đăng nhập Hub*, không chip, huy hiệu `!`.
- Khách sạn chưa ghép (`HOTEL_NOT_LINKED`): khung nói mã ezCloud 4123 chưa ghép, báo Quản trị hệ thống.
- Hub hỏng (502), máy chưa có bản đệm: *Không gọi được Hub*, có nút Thử lại.

Lượt đo đầu bắt được hai câu sai, đã sửa trước khi commit: popup ghi *"Hub chưa có mã kết nối Booking OTA"*
cho cả ca chưa ghép cơ sở và ca Hub hỏng; huy hiệu vẫn là số chưa đọc sau khi hết phiên. Có ca test giữ.

**Không đo được ở đây:** PMS ezCloud thật (vị trí thông báo nổi so với thanh đầu thật của PMS chỉ đúng
nếu PMS thật cũng để trống dải giữa như mockup giả định), Hub thật, Apps Script thật, Chrome máy quầy.


## 4. Hợp đồng route thông báo cho làn B (đề xuất, Hub chưa có)

Cùng kiểu xác thực với hai route extension đã có: **phiên Better Auth** (cookie), gọi từ service worker.
Route phải nằm trong danh sách loại trừ của `src/proxy.ts`, nếu không proxy chuyển hướng về `/login`
(extension cũng đọc chuyển hướng ấy thành "chưa đăng nhập").

```
GET /api/extension/notifications
  200 { ok: true,
        me: { name: string },
        unread: number,                       // H-1262 a: đếm theo người đang đăng nhập
        settings?: { toastSeconds?: number }, // thời gian tự ẩn thông báo nổi; vắng ⇒ 8 (giá trị tạm)
        items: [{ id: string, title: string, body: string, from: string,
                  createdAt: ISO, readAt: ISO | null,
                  url: string | null,         // đường trên Hub, bắt đầu bằng "/"
                  kind: string,               // nhãn nguồn, chỉ để vẽ
                  sticky: boolean }] }        // H-1344: phải bấm mới tắt / ghim
  401 { ok: false, error: "NOT_SIGNED_IN" }

POST /api/extension/notifications/read
  body { ids: string[] }                      // tối đa 100 id; extension chỉ gửi id người dùng bấm Đã đọc
  Origin: chrome-extension://<id>             // qua extensionWriteAllowed như report= của connection
  200 { ok: true, unread: number }
  401 { ok: false, error: "NOT_SIGNED_IN" }
```

- Ghi Đã đọc vào đâu (Bảng tin hay `notifications.readAt`) là **H-1343**, việc của Hub ở route POST.
- Dòng nào `sticky` là **H-1344**, Hub đặt; extension không suy theo `kind`.
- Mở thông báo trên Hub **không** tính là đã đọc (H-1263 b); chỉ nút Đã đọc gọi POST.

Đề xuất thêm cho route `GET /api/extension/indicators` (để tab Chỉ báo đủ như mockup, extension đã đọc sẵn,
vắng thì ẩn): mỗi tình huống thêm `display: { mark: "warning" | "notice" | "over-capacity", main: string,
chips: string[], todo: string | null }`. `mark` tính bằng luật mức có sẵn của Hub; `todo` là khe H-1345.

## 5. Việc ra ngoài chờ user duyệt từng việc

Làn không làm việc nào dưới đây.

1. Push nhánh `yc112-extension-v2` lên remote `urbanb-reviews`.
2. Thử P4 với Hub thật: mở dev server Hub, vào bằng dev-login, nạp extension chưa đóng gói, xem tab Chỉ báo
   ra số thật (đọc DB dev, không ghi gì ngoài dòng "máy quầy gọi lần cuối" mà route `connection` vốn ghi).
3. Thử Booking OTA với Apps Script thật của một cơ sở: GET danh sách là đọc; **Khoá G2J là ghi thật lên
   Go2Joy**, đẩy token là ghi vào Sheet của khách sạn ⇒ duyệt riêng từng việc.
4. Đóng gói, cài lên máy quầy, tắt userscript EZCloud OTA Sync trong Tampermonkey.
5. Đổi chữ màn Hub `/admin/ota-sync-codes` sang "Mã kết nối Booking OTA" (H-1265 a). Nằm ở repo UrbanB,
   làn này không được ghi.
6. Làn B dựng hai route thông báo (mục 4) và, nếu đồng ý, trường `display` cho route chỉ báo.


## 6. Câu hỏi cho user (chưa đánh số H)

1. Nút *Đánh dấu đã đọc hết* của mockup có bật không? Đang tắt (`notifications.js § SWITCHES.readAll`),
   vì H-1263 b đòi bấm Đã đọc rõ ràng, còn đọc hết một lần có hợp nghĩa ấy không thì chưa ai hỏi.
2. Thông báo nổi tự ẩn sau bao lâu? Đang dùng 8 giây, là giá trị tạm của mockup; Hub trả
   `settings.toastSeconds` thì dùng số của Hub.
3. Nhiều thông báo mới về cùng lúc: extension hiện một thông báo nổi (mới nhất) kèm chữ *"và N thông báo
   mới khác"*, không bắn liên tiếp. Đây là lựa chọn của làn, chưa ai chốt.
4. Route chỉ báo có thêm `display.mark` (và `main`, `chips`, `todo`) như mục 4 không? Không thêm thì tab
   Chỉ báo không có nhãn Cảnh báo/Chú ý, chấm nút gập không đỏ/vàng được, chỉ *Đặt vượt quỹ* có nhãn.
5. Token Go2Joy (bắt trên HA Go2Joy) được gửi về Apps Script của **khách sạn PMS mở gần nhất** trên máy
   (SUY: HA Go2Joy không cho biết cơ sở ezCloud nào). Máy quầy dùng cho một cơ sở thì đúng; máy dùng chung
   nhiều cơ sở thì có thể gửi nhầm. Chấp nhận, hay cần Hub ghép `hotelSn` Go2Joy với cơ sở?
6. Bỏ nút *Đăng xuất* trong popup (đăng xuất ở Hub tab thường). Đồng ý?
7. Thu review vẫn đi đường Sheet + token Hub cũ, chưa dùng phiên Hub ⇒ vế *"thu review dừng khi hết phiên"*
   của H-1245 a chưa áp. Có chuyển thu review sang phiên Hub ở bản sau không?
8. Huy hiệu `!` khi chưa đăng nhập Hub (theo mockup). Máy chỉ dùng thu review, không ai đăng nhập Hub, sẽ
   luôn có `!`. Chấp nhận?
