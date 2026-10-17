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

<!-- các mục sau điền khi xong từng phần -->
