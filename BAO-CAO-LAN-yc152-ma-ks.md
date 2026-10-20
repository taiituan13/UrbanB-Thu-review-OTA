# Báo cáo làn yc152-ma-ks: extension không biết PMS đang mở cơ sở nào

Nhánh `lane/yc152-ma-ks`, nền `main` 19fb60a. Chưa push, chưa gộp, chưa tăng phiên bản.

## Kết quả

Khung quầy biết cơ sở nhờ **tiêu đề tab PMS**. PMS tự ghi tiêu đề `ezCloudHotel <mã KS> - … - <tài khoản>`
theo cơ sở đang chọn. Đường cũ (đọc claim HotelId trong token Bearer) vẫn giữ cho máy còn bản PMS cũ.

| Tệp | Đổi |
|---|---|
| `extension/bridge.js` | Đọc `document.title` theo đúng dạng `^ezCloudHotel <3–9 chữ số> - `. Đọc lúc nạp và lại mỗi 2 giây (chỉ so chuỗi), vì đổi cơ sở có thể không tải lại trang. Mã đổi thì báo khung (`onHotel`) và gửi `quay:pageHotel` cho service worker. Chỉ chạy trên PMS, HA Go2Joy không đọc. |
| `extension/quay/sw.js` | Thêm `quay:pageHotel`: chỉ nhận chuỗi số, ghi `quayLastHotel` và `quayTab:<tab>` như đường token. Gộp phần ghi này vào hàm `rememberHotel`. |
| `extension/quay/booking-ota.js` | Thêm `storageTokenPushable`: JWT ezCloud **đọc từ bộ nhớ trang** chỉ gửi về Apps Script khi nó mang mã KS. Lý do ở mục "Token về Apps Script". |
| `test/bridge.test.mjs` (mới), `test/booking-ota.test.mjs` | Có test đối chứng (xem mục Test). |

## ĐO và SUY

**ĐO** (điều phối đo trên Chrome thật 20/10, ghi trong đề làn):
- Request `/api/` của PMS trả 200 mà không gọi `setRequestHeader("Authorization")`, và không có tin `__urbanbQuay` nào.
- Trong `localStorage` có hai JWT, `tokenWidget` và `oidc.user:…` (id_token). Không JWT nào có claim mã KS.
- Tiêu đề tab là `ezCloudHotel 15739 - 67 - <email>`. Ô chọn KS hiện `15739 - 67`.

**ĐO** (trong repo, làn này): `ezcloud-ota-booking-sync/hotels/COL.json` ghi `"ezcloudHotelId": 15739`.
Vậy số đứng đầu tiêu đề đúng là mã KS ezCloud mà Hub và Apps Script đang dùng. Còn số thứ hai (`67`)
là gì thì chưa biết, và code không dùng nó.

**Không đo được trong làn này.** Bộ phân loại quyền của phiên chặn cả hai lần tôi nhờ điều phối chạy
đoạn đo. Lần 1 bị chặn vì đọc storage/token, lần 2 bị chặn vì đọc dữ liệu production, dù đoạn đo chỉ
đọc lời đáp JSON. Vì vậy những điều sau vẫn **chưa đo**:
- `access_token` trong `oidc.user` có phải JWT không, và có mang mã KS không.
- Lời đáp `GetCurrentHotelConnectivities` / `get-all-hotel-setting` có mang mã KS không, và ở trường nào.
- PMS mới xác thực bằng gì: cookie HttpOnly (`document.cookie` không thấy), header tên khác, hay
  request tới host khác mà `capture.js` không nghe (nó chỉ nghe `pms.ezcloudhotel.com/api/`).

Đoạn đo vẫn để trong thư mục ghi chú chung, tên `yc152-ma-ks-do-pms.js`. Đó là bản an toàn: không đọc
storage, token hay header, chỉ in path JSON tới chỗ có mã KS. Người dùng có thể tự chạy trong Console
của tab PMS.

**SUY:**
- Đổi cơ sở trên PMS thì tiêu đề đổi theo. Việc đọc lại mỗi 2 giây lo được cả hai trường hợp: PMS tải
  lại trang hoặc không tải lại.
- Tiêu đề là chuỗi hiển thị, nhưng nó do chính PMS sinh theo cơ sở đang chọn. Đề làn muốn ưu tiên một
  nguồn máy đọc được. Tôi không đo được nguồn nào như vậy (xem trên), nên chọn nguồn duy nhất đã đo. Dạng
  khớp được giữ chặt và có test đối chứng. Script lạ trên trang có thể sửa tiêu đề, nhưng cũng giả được tin
  token như trước. Hub vẫn chỉ trả dữ liệu của cơ sở mà người đăng nhập được gán.

## Token về Apps Script (quay:token): bị ảnh hưởng gì

- PMS không còn gửi Bearer, nên `capture.js` không bắt được token nào và **không có token PMS nào được
  đẩy về Apps Script nữa**. Làn này không tạo luồng thay thế.
- Lối dự phòng (sau 10 giây đọc JWT trong storage) trước đây tự dừng, vì chưa biết mã KS. Nay mã KS đọc
  được từ tiêu đề, nên lối này sẽ đẩy `tokenWidget` (JWT của widget chat) về Apps Script dưới tên token
  ezCloud. Apps Script sẽ từ chối, rồi cứ 10 phút lại thử. Tôi chặn bằng `storageTokenPushable`: JWT
  ezCloud lấy từ storage chỉ được gửi khi mang mã KS. Token Go2Joy không đổi.
- **SUY, cần người dùng xác nhận:** Apps Script (`04_EzCloudApi.js`) gọi API ezCloud bằng `Authorization:
  Bearer <token đã đẩy>`. Không có token mới thì khi token cuối cùng hết hạn, Booking OTA và Khoá G2J
  (đọc/khoá qua Apps Script) sẽ lỗi ở mọi KS đã lên PMS mới. Ở lỗi này, khung quầy đã biết cơ sở,
  nhưng phần Booking OTA và Khoá G2J vẫn có thể báo lỗi token.

## Câu hỏi cho người dùng

1. **Token ezCloud cho Apps Script lấy ở đâu khi PMS không còn Bearer?** Các lối xếp theo lợi cho lễ tân:
   - **a.** Cho phép đo PMS mới xác thực bằng gì: tự chạy đoạn đo, hoặc cho phiên điều phối chạy. Nếu PMS
     gửi token ở header khác hoặc tới host khác, `capture.js` bắt và đẩy như cũ, lễ tân không phải làm gì.
     Nếu là cookie HttpOnly thì extension không đọc được và không chuyển được cho Apps Script, phải chọn b hoặc c.
   - **b.** Apps Script tự lấy quyền với ezCloud: API đối tác hoặc tài khoản dịch vụ. Cần ezCloud cấp quyền.
     Lễ tân không phải làm gì, nhưng phụ thuộc bên ngoài.
   - **c.** Lễ tân dán cURL/token bằng tay vào sidebar Apps Script (lối dự phòng có sẵn trong README của
     ezcloud-ota-booking-sync). Chạy được ngay, nhưng tốn công lễ tân mỗi lần token hết hạn.
2. Có muốn đọc thêm mã KS từ lời đáp API của PMS (nguồn máy đọc được) không? Cần đo trước như lối a.
   Hiện chỉ dùng tiêu đề tab.
3. Trước khi ra bản: tăng phiên bản (1.1.1?) ở `manifest.json` và `config.js`. Việc này điều phối làm lúc gộp.

## Test

- `npm test`: 180/180 xanh.
- `npm run typecheck`: sạch (exit 0). Worktree không có `node_modules`, nên tôi tạm symlink từ
  `../urbanb-reviews` để chạy, xong đã gỡ. `tsconfig` chỉ xét `src/**`.
- Kiểm phản chứng: tôi tạm bỏ `readTitle()` cùng vòng 2 giây trong `bridge.js`, và bỏ luật ezCloud trong
  `storageTokenPushable`. Khi đó 3 test đỏ: hai test đọc tiêu đề và test `storageTokenPushable`. Trả lại
  thì xanh. Test đối chứng về dạng tiêu đề sai (không tiền tố, thiếu ` - `, mã chữ, mã 2 chữ số) và về
  trang HA Go2Joy cũng có.

## Bước test trên Chrome thật (điều phối chạy)

1. `chrome://extensions` → nạp lại bản giải nén từ worktree này (chưa tăng phiên bản nên phải bấm nạp lại).
2. Mở PMS (đã đăng nhập, KS 15739), tải lại trang. Mở khung quầy: không còn dòng "chưa biết cơ sở" / "Chưa
   biết PMS đang mở cơ sở nào". Khung hiện cơ sở Hub ghép với 15739. Nếu Hub chưa ghép thì khung báo
   "Mã khách sạn ezCloud: 15739 …", và đó cũng là đúng.
3. DevTools của tab PMS, Console, chọn ngữ cảnh "UrbanB tại quầy" (thế giới ISOLATED):
   `__urbanbQuayBridge.hotelId` phải ra `"15739"`.
4. Console của service worker: `chrome.storage.local.get("quayLastHotel")` phải ra `15739`.
5. Nếu tài khoản có cơ sở thứ hai: đổi cơ sở ở ô góc trên. Trong khoảng 2 giây, tiêu đề tab và khung đổi
   theo mã mới.
6. Chờ hơn 10 giây sau khi tải trang, không bấm Khoá. Trong tab Network của service worker không được có **POST** tới
   `script.google.com` / `script.googleusercontent.com` (đó là đẩy token). Các GET đọc booking là bình thường.
7. Tab Booking OTA và Khoá G2J: ghi lại có lỗi token hay không, để trả lời câu hỏi 1.
