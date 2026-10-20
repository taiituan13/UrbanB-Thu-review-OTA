# Báo cáo làn `yc152-phien`: extension đẩy review theo phiên Hub (20/10/2026)

Repo `urbanb-reviews`, worktree `urbanb-reviews-yc152-phien`, nhánh `lane/yc152-phien`, nền `main@d8302a4`
(bản 1.0.0). Repo UrbanB chỉ được đọc để lấy hợp đồng route. **Chưa push, chưa tạo release.**

Nhãn: **ĐO** = đã chạy và thấy kết quả. **SUY** = suy từ mã, cần lượt thử thật xác nhận.

## Commit

| Mục | Commit | Nội dung |
|---|---|---|
| 1 | `645510b` | `POST /api/ingest/reviews` không gửi `Authorization`, dựa vào cookie phiên Hub. Bỏ Token Hub và URL Hub |
| 2 | `90fbe65` | Kênh quét, chu kỳ quét, thời gian tự ẩn thông báo đọc từ `reviewCollect` và `settings` của Hub |
| 3 | `69beb31` | `?scope=mine` liệt kê cơ sở của người đăng nhập, chọn cơ sở khi có nhiều, `?branchId=` cho token Go2Joy |
| 4 | `72966fe` | Tin `canMarkRead: false` không có nút "Đã đọc", thay bằng nút mở Hub để xác nhận |
| 5 | `ec02d9f` | Bản 1.1.0 (`manifest.json` và `VERSION`), README và `docs/` bỏ Token Hub |
| thêm | `5474ceb` | Popup mở lúc chưa đăng nhập Hub không còn gọi Hub liên tục (lỗi có từ 1.0.0, xem dưới) |

## Đã làm theo từng mục

**Mục 1 (H-1233 a).** `extension/hub.js`: `ingestRequest` chỉ có `content-type`, không có `Authorization`.
Lượt gửi đi qua `hubFetch` của quầy (`credentials: "include"`) tới chính Hub mà quầy đang dùng
(`quayHubOrigin`), nên không còn khái niệm "chưa cấu hình Hub". `parseIngestReply` phân loại:
401 / `NOT_SIGNED_IN` / chuyển hướng về `/login` ⇒ "Chưa đăng nhập Hub, hoặc phiên Hub đã hết. Mở Hub,
đăng nhập…" (mã `HUB-LOGIN`, báo luôn trạng thái phiên cho huy hiệu); `FORBIDDEN_ORIGIN` ⇒ `HUB-ORIGIN`;
403 khác ⇒ chưa có quyền thêm review (`HUB-SCOPE`); `rejected` (`OUT_OF_SCOPE`) ghi nhật ký `HUB-SCOPE` và
tóm tắt "N mã ngoài phạm vi"; `unmatched` hiện "N chờ ghép". `hubUrl`, `hubToken` bị xoá khỏi bộ nhớ khi
nạp cấu hình; mã cài đặt `v: 1` cũ có hai trường này vẫn đọc được, hai trường bị bỏ qua.

**Mục 2 (H-1348 a).** `extension/hub-config.js` mới. Mọi lời đáp 200 của `connection` có
`reviewCollect` / `settings` đều được lưu vào `hubCollect`. Có `enabled` ⇒ kênh theo Hub (khoá thiếu là
tắt, không trộn mặc định máy); có `intervalHours` ⇒ báo thức theo Hub, đổi ngay khi số khác. Hub vắng ⇒
kênh theo cấu hình máy (mã cài đặt), chu kỳ theo mặc định extension (6 giờ). Ô nhập chu kỳ ở popup đã bỏ;
ô Kênh quét bị khoá khi Hub điều khiển. `toastSeconds` của Hub dùng khi nguồn thông báo không tự gửi.
Lượt quét và lượt kiểm bản mới đều làm mới cấu hình Hub trước.

**Mục 3 (H-1351 c).** `GET ?scope=mine` (chỉ đọc) lấy danh sách cơ sở. Một cơ sở ⇒ dùng luôn. Nhiều cơ sở ⇒
popup hiện ô chọn; token Go2Joy chỉ gửi khi đã chọn, qua `?branchId=<id>`, không đoán theo ezCloud. Chưa
chọn ⇒ nhắc trong quầy (tối đa 10 phút một lần). Chưa lấy được danh sách ⇒ giữ cách 1.0.0 (theo
ezCloud hotel id cuối). Đổi Hub thì xoá danh sách và lựa chọn cũ.

**Mục 4 (H-1374 a).** `canMarkRead !== false` mới có nút "Đã đọc". Ngược lại: bản tin ⇒ nút "Xác nhận trên
Hub", tin khác ⇒ "Mở trên Hub", mở `/notifications` ở tab mới. "Đánh dấu tất cả đã đọc" lọc bỏ các tin này.

**Mục 5.** `docs/cai-dat.md` §6 viết lại (phiên Hub, cấu hình Hub, nhiều cơ sở), `docs/ma-loi.md` thêm
`HUB-LOGIN`, `HUB-SCOPE`, `HUB-ORIGIN`, bỏ `HUB-URL`, `HUB-TOKEN`; `README.md`, `docs/cai-tu-xa.md` ghi rõ không
cần URL/Token Hub.

**Thêm: vòng lặp popup.** Chưa đăng nhập Hub mà mở popup: mỗi lượt hỏi Hub ghi lại ảnh trạng thái, popup
vẽ lại và hỏi tiếp. **ĐO** (Chromium Playwright, Hub giả trả 401, 4 giây): 1.0.0 gọi 562 lượt, 1.1.0 trước
sửa 236, sau sửa 3. Giờ chỉ ghi khi phiên thực sự đổi (`outSessionPatch`).

## Kiểm tra

- **ĐO** `npm test`: 175 pass, 0 fail. `npm run typecheck`: sạch (chỉ phủ `src/**/*.ts`, không phủ extension).
- **ĐO** Mỗi luật mới có test phản chứng; đã thử sửa ngược từng luật bằng `sed` (gửi lại `Authorization`,
  trộn mặc định khi Hub tắt kênh, đoán cơ sở khi nhiều, hiện "Đã đọc" khi `canMarkRead: false`, ghi ảnh
  mỗi lượt): test tương ứng đỏ.
- **ĐO** Nạp extension 1.1.0 vào Chromium Playwright với Hub giả: service worker không lỗi; `POST` ingest
  có `Authorization` rỗng, `Origin: chrome-extension://…`; 401 ⇒ nhật ký `HUB-LOGIN` và huy hiệu "hết
  phiên"; popup hiện "tự quét mỗi 3 giờ (theo cấu hình trên Hub)", ô kênh bị khoá đúng theo Hub, không còn ô
  chu kỳ và Token Hub; báo thức đổi sang 180 phút; ô chọn cơ sở hiện và lưu `quayBranchId`; bấm Lưu xoá
  `hubToken` cũ khỏi bộ nhớ.

## Chưa kiểm trên Chrome thật với Hub thật

- Cookie phiên đi theo `POST` từ service worker tới Hub thật (YC-112 đã đo với máy chủ giả đặt cookie như
  Better Auth: có đi theo; với Hub production thì **SUY**).
- `FORBIDDEN_ORIGIN` thật: Hub phải nhận origin `chrome-extension://` của bản cài ở KS (**SUY** theo
  `extensionWriteAllowed`).
- Hub thật trả `reviewCollect` / `toastSeconds` / `scope=mine` đúng như đọc trong mã; `rejected` và
  `unmatched` hiện đúng chữ khi có dữ liệu thật.
- Tài khoản nhiều cơ sở chọn cơ sở rồi gửi token Go2Joy.

## Việc tiếp theo (chưa làm trong làn)

1. `apps-script/Code.gs`: hộp thoại "Tạo lệnh cài" vẫn có ô URL Hub, Token Hub và bắt điền Token khi có
   URL (`Code.gs:555–730`). Extension 1.1.0 bỏ qua hai trường này nên không hỏng. Muốn gỡ thì sửa `Code.gs`,
   user phải dán lại và triển khai **Phiên bản mới**.
2. `connection` có trả `reviewSheet`; có thể thay cấu hình Sheet ở máy bằng cấu hình trên Hub.
3. `docs/kien-truc.html` là sơ đồ lúc đầu, còn vẽ Token Hub.
4. Phát hành: user push `main` của `taiituan13/UrbanB-Thu-review-OTA`; máy KS tự báo có bản 1.1.0. Nhân viên
   quầy cần đăng nhập Hub trong Chrome đó, nếu không review không lên Hub (Sheet vẫn nhận).
