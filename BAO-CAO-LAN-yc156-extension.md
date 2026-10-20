# Báo cáo làn yc156-extension (repo urbanb-reviews)

Nhánh `lane/yc156-extension`, tách từ `main` 881c46d. Chưa push, chưa deploy.

| sha | Nội dung |
|---|---|
| `acc8c41` | Mục 1–2 · H-1526 a: `hub-bridge.js`, Hub tự theo màn `/extension`, hợp đồng `ext:hello` / `ext:status`, popup bỏ ô chọn Hub |
| `d22c303` | Mục 3 · H-1527 a: thu review nhận `reviewSheet` và `reviewIds` từ Hub, bỏ mã URB1 và ô nhập tay khỏi popup |
| `440acbd` | Tài liệu (`docs/cai-dat.md`, `docs/cai-tu-xa.md`, `docs/ma-loi.md`, `README.md`) |
| `dfcedb9` | Bản 1.2.0 (`manifest.json` và `VERSION` trong `config.js`) |

`npm test`: 206 pass, 0 fail. `npm run typecheck`: exit 0.

## 1. H-1526 a: Hub theo màn Cài extension

- Content script mới `extension/hub-bridge.js` chạy trên `https://hub.urbanb.vn/*` và `https://urbanb.xyz/*`
  (thế giới ISOLATED, `document_idle`).
- Trang ở đường `/extension` (hoặc `/extension/`) thì service worker đổi Hub sang gốc của trang, qua đúng
  đường `setHubOrigin` cũ:
  - Gốc lấy từ `sender` của Chrome, không lấy từ nội dung tin.
  - Gốc phải nằm trong `HUB_ORIGINS`.
  - Trang cùng Hub với máy thì không đổi gì, để khỏi xoá phiên và danh sách cơ sở.
  - Đồng bộ `scope=mine` ngay khi mở màn này, tối đa 15 giây một lần.
- Popup bỏ ô chọn Hub. Giờ chỉ còn dòng "Hub đang dùng: …" kèm câu giải thích.

## 2. Hợp đồng với trang Hub (giữ đúng brief, không đổi)

- Chạy là đặt `document.documentElement.dataset.urbanbExt = "<version>"`.
- Trang gửi `window.postMessage({source:"urbanb-hub", type:"ext:hello"}, location.origin)`.
- Extension trả `{source:"urbanb-ext", type:"ext:status", status}` tới `location.origin`. Có hai lúc trả:
  - lúc vừa nạp;
  - mỗi lần nhận hello. Hello đến dồn dập thì gộp lại, chỉ trả thêm một lượt.
- Chỉ nhận tin có `event.source === window` và `event.origin === location.origin`.
- Dạng `status`:
  `{version, hub, hubFollowed, signedIn, branch:{id,name}|null, pms:{lastSeenAt,hotelName}, review:{configured, fromHub, lastScanAt}}`.
  Các trường lấy giá trị như sau:
  - `hubFollowed`: Hub máy đang dùng trùng gốc của trang.
  - `signedIn`:
    - true khi phiên ổn, hoặc đã đăng nhập nhưng chưa được gán cơ sở;
    - false khi chưa đăng nhập hoặc hết phiên;
    - null khi chưa biết (lỗi mạng, chưa hỏi).
  - `branch`: cơ sở đang dùng. Tài khoản có nhiều cơ sở mà chưa chọn thì null.
  - `pms.lastSeenAt`: lần cuối máy thấy PMS ezCloud.
  - `pms.hotelName`: tên cơ sở khớp mã khách sạn PMS.
  - `review.configured`: true khi máy có đủ Sheet, mã bí mật và tên khách sạn.
  - `review.fromHub`: true khi Sheet lấy từ Hub.
  - `review.lastScanAt`: giờ quét gần nhất trong mọi kênh.
- Có test chặn lọt dữ liệu: dù đầu vào có token, mã bí mật, URL Sheet hay `otaSync`, `status` cũng không mang
  ra. Test cũng chốt danh sách khoá của `status`.

## 3. H-1527 a: thu review theo Hub

- Đọc `reviewSheet: {sheetUrl, secret, updatedAt} | null` của `GET /api/extension/connection?scope=mine`.
  Chỉ nhận khi URL đúng dạng Web App Apps Script (`APPS_SCRIPT_URL_RE`, cùng luật với Hub) và mã bí mật
  không rỗng.
- Hub có Sheet thì Hub thắng cấu hình cũ:
  - Sheet và mã bí mật lấy theo Hub.
  - Tên khách sạn là `branch.name` của cơ sở đang dùng.
  - Mã chỗ nghỉ lấy theo `branches[].reviewIds.{booking,agoda,expedia}`. Mã nào null thì giữ mã cũ của máy.
    Máy cũng không có mã đó thì để extension tự dò.
- Hub không có Sheet (`reviewSheet` null): máy chạy nguyên cấu hình cũ trong bộ nhớ. Popup ghi
  "Hub chưa có cấu hình thu review. Máy đang chạy bằng cấu hình cũ trong bộ nhớ."
- Popup đã bỏ các ô: mã URB1, tên khách sạn, URL Sheet, mã bí mật, kênh quét, mã Booking/Agoda/Expedia, nút
  Lưu.
  - Phần Thu review giờ chỉ cho biết từng mục lấy từ Hub hay từ cấu hình cũ.
  - Popup không in URL Sheet hay mã bí mật (có test).
  - Nút Thử Sheet vẫn giữ.
- Lượt quét, huy hiệu, Thử Sheet và popup dùng chung một câu nhắc khi máy thiếu cấu hình
  (`reviewMissingText`). Các trường hợp:
  - chưa đăng nhập Hub;
  - Hub chưa có Sheet;
  - tài khoản có nhiều cơ sở mà chưa chọn.
- Mã lỗi `SHEET-CONFIG`, `-MULTI`, `-NOID` và câu lỗi Booking/Agoda/Expedia giờ chỉ người đọc về Hub, không
  còn chỉ về ô nhập tay.
- Giữ theo bất biến của CLAUDE.md: máy vẫn nạp mã `URB1.` từ `ma-cai-dat.txt` (`importSetupFile`). Lệnh cài
  đã gửi cho khách sạn vẫn chạy. Cấu hình trong mã chỉ dùng khi Hub chưa có Sheet.

## 4. Test và thử đột biến

Test mới:

- `test/hub-extension.test.mjs`:
  - nạp `hub-bridge.js` trong `vm`, kiểm dấu phiên bản, lần tự trả lúc nạp và trả lời hello;
  - đối chứng tin từ khung khác, origin khác, nguồn khác, kiểu khác;
  - luật thuần `isExtensionPage`, `followHub`, `extStatusOf`.
- `test/review-hub.test.mjs`:
  - `parseReviewSheet`, `parseReviewIds`;
  - Hub thắng / Hub vắng / nhiều cơ sở;
  - câu nhắc thiếu cấu hình, nguồn hiển thị trên popup;
  - popup không còn ô nhập, lượt quét dùng câu nhắc chung.

Thử đột biến bằng cách bỏ hoặc đảo từng luật, rồi chạy lại `npm test`. Mọi đột biến đều làm test đỏ:

- Mục 1–2: 12/12 đỏ. Các luật bị phá:
  - kiểm `event.source`, kiểm `event.origin`;
  - lần tự trả lúc nạp;
  - `/extension` chính xác;
  - follow cùng gốc, follow gốc lạ;
  - gốc lấy từ sender;
  - lọt URL/token vào status;
  - …
- Mục 3: 13/13 đỏ. Các luật bị phá:
  - Sheet / mã bí mật / tên / mã Booking / mã Expedia không theo Hub;
  - lấy tên cơ sở dù Hub không có Sheet;
  - bỏ kiểm URL, bỏ kiểm mã bí mật rỗng;
  - không lưu `reviewSheet`;
  - `reviewIds` rỗng không thành null;
  - popup không cảnh báo khi Hub vắng cấu hình, popup in URL Sheet;
  - lượt quét bỏ câu nhắc chung.

## 5. Chưa thử trên Chrome thật

Việc thử phải có người đăng nhập Hub test (lễ tân COL), mà tôi không gõ mật khẩu. Các bước để người thử tự
làm:

1. Ở `chrome://extensions`, nạp thư mục `extension/` của nhánh này (hoặc chép đè vào `C:\UrbanB\extension`
   rồi bấm nạp lại). Thẻ extension phải ghi 1.2.0.
2. Đăng nhập `https://urbanb.xyz` bằng lễ tân COL, mở `/extension`. Mở DevTools của trang và kiểm:
   - `document.documentElement.dataset.urbanbExt` trả `"1.2.0"`.
   - Chạy:
     ```js
     addEventListener("message", e => e.data?.source === "urbanb-ext" && console.log(e.data.status));
     postMessage({source:"urbanb-hub", type:"ext:hello"}, location.origin)
     ```
     Console phải in `hub: "https://urbanb.xyz"`, `hubFollowed: true`, `signedIn: true`,
     `branch.name` của cơ sở COL.
3. Mở popup: dòng "Hub đang dùng" ghi urbanb.xyz. Mục Thu review OTA cho biết nguồn cấu hình:
   - Hub test đã điền Sheet thu review thì ghi "theo cấu hình trên Hub";
   - chưa điền thì ghi "Hub chưa có cấu hình thu review".
4. Mở `https://hub.urbanb.vn/extension` thì Hub của máy đổi về hub.urbanb.vn. Mở trang khác `/extension`
   trên cùng Hub thì máy không đổi gì.

## 6. Câu hỏi và lưu ý nghiệp vụ cho điều phối

1. **Tên khách sạn trong Sheet có thể đổi.** Khi Hub có Sheet, tên ghi vào cột "Khách sạn" và khoá máy ở
   tab `Máy cài` thành `branch.name` trên Hub.
   - Nếu tên đó khác tên đã cài (ví dụ "Colline Hotel" và "Colline"), tab `Máy cài` sẽ có dòng máy mới, và
     bài mới đứng tên khác bài cũ. Thống kê theo khách sạn bị tách đôi.
   - Bài trùng vẫn không ghi lại hai lần, vì khoá chống trùng không gồm tên.
   - Đề xuất: trước khi điền Sheet trên Hub, Quản trị hệ thống đặt tên cơ sở trên Hub khớp tên đã dùng
     trong Sheet. Nếu không, cần một quyết định khác.
2. **`reviewIds` trong `branches[]`.** Extension đọc trường này nếu có. Làn Hub chưa trả thì máy giữ mã cũ,
   không có mã cũ thì tự dò. Không hỏng gì.
3. **Mã bí mật Sheet đi qua `scope=mine`.** Mọi tài khoản lễ tân đăng nhập được đều nhận mã này. Máy lưu
   nó trong `chrome.storage.local` (khoá `hubCollect`), như cấu hình cũ, và không gửi qua postMessage. Theo
   đúng brief, nhưng ghi lại để điều phối biết.
4. Hợp đồng `ext:status` giữ đúng brief, không thêm hay bớt trường.

## Việc tiếp

- Duyệt rồi gộp vào `main`. Push lên `main` là phát hành 1.2.0 tới mọi khách sạn.
- Không sửa `Code.gs`, nên không phải triển khai lại Apps Script.
