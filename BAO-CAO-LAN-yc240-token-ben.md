# Báo cáo làn lane-yc240-token-ben (YC-240, H-1980 a phần 2)

Nhánh `lane/yc240-token-ben`, nền `main@dcee9a2` (1.5.4 chưa phát hành). Không merge, không push, không gọi
Web App, ezCloud hay Go2Joy thật. Mục ③ làm theo duyệt của điều phối (lối a: dùng lại `TOKEN_REJECTED`).

## Commit

| Mục | Commit | Nội dung |
|---|---|---|
| ① | `12a4d27` | Lượt đẩy token bị từ chối hoặc chờ xác nhận ⇒ dòng bền tới lượt lưu được |
| ② | `2f5749a` | Đọc `result.tokenHealth.ezcloud` ở lượt đọc gần đây và bảng khoá |
| ④ | `b356289` | Mục 1.5.4 trong `CHANGELOG.md` (không tăng bản) |
| ③ | `f26effa` | Sheet báo `auth-failed` ⇒ lượt báo sống lên Hub mang `TOKEN_REJECTED` |

## Tệp đã sửa

- `extension/quay/hub-quay.js`: thêm `whenText`, `scrubSecrets`, `readTokenHealth`, `latestHealth`,
  `tokenAlerts` (luật thuần); `dockModel` nhận `token`; `popupPmsRow(snap, now)` thêm dòng lời báo.
- `extension/quay/sw.js`: bản ghi `quayTokenAt:<kind>` thêm `codeRejected`; `statusForPopup` trả `tokens`;
  `bookings` (lượt gần đây) và `board` đọc `tokenHealth`, lưu vào ảnh trạng thái và bản đệm `quayBook:<ks>`.
- `extension/quay/ui.js`: dòng bền ở đầu cả ba tab (Booking OTA, Bảng khoá, Việc cần làm); nút gập thêm một
  đoạn; vẽ lại khi `quayTokenAt:*` đổi (`chrome.storage.onChanged`); sức khoẻ lấy từ lượt đọc gần nhất.
- `extension/quay/counter-problems.js` (③): `TOKEN_REJECTED` sinh cả khi Sheet báo `auth-failed`.
- `test/token-ben.test.mjs` (mới, 20 ca), `CHANGELOG.md`.

## Luật đã đặt

- ① Dòng theo **lượt đẩy gần nhất** của từng loại token (`rejected`, `pending`). Không tự hết theo giờ. Hết khi
  lượt đẩy kế trả `saved` hoặc `unchanged`. Lời 10 giây lần đầu (`quay:tokenNote`) giữ nguyên.
- ② `tokenHealth.ezcloud.state`: `auth-failed` và `missing` ⇒ dòng đỏ; `pending` ⇒ dòng vàng; `ok`, không có
  trường, trạng thái lạ ⇒ không hiện. `message` của Apps Script không dùng; chữ hiện do extension viết.
- Bản đọc sức khoẻ bị bỏ khi máy **lưu được** (`saved`) token mới sau lượt đọc ấy. `unchanged` không bỏ, vì
  có thể chính token đã chết được gửi lại.
- `pending` ở cả lượt đẩy lẫn sức khoẻ ⇒ một dòng.
- ③ Dùng lại `TOKEN_REJECTED` **theo duyệt của điều phối** (lối a; nhãn Hub "Phiên PMS máy đẩy lên bị Booking
  OTA từ chối", lời sửa đúng cho cả ca này). Không thêm mã mới, không đổi hợp đồng HTTP. `auth-failed` còn
  đúng (`healthIsCurrent`, cùng luật với khung) ⇒ detail `ezcloud, đã lưu rồi bị ezCloud từ chối, N đơn chờ`
  (N = 0 ⇒ bỏ phần số), since = `authFailedAt`. Lượt đẩy bị từ chối giữ detail cũ (`ezcloud`, `go2joy`,
  `ezcloud,go2joy`); có cả hai ⇒ một mã, hai phần nối bằng `; `, since sớm nhất. `ok`, `pending`, `missing`,
  không có trường ⇒ không báo.
- Câu lỗi Apps Script lọc chuỗi kiểu JWT, URL, email, chuỗi ≥ 32 ký tự liền, cắt 200 ký tự.

## Chữ hiện cho lễ tân (nguyên văn, `<…>` là phần thay)

Lượt đẩy (①):

- `Booking OTA: Google Sheet của khách sạn không nhận phiên đăng nhập PMS máy gửi lúc <hh:mm>. Mở lại hoặc đăng nhập lại PMS để máy gửi phiên mới. Chi tiết: <câu lỗi Apps Script đã lọc>`
- Go2Joy: `Booking OTA: Google Sheet của khách sạn không nhận phiên đăng nhập Go2Joy máy gửi lúc <hh:mm>. Mở lại hoặc đăng nhập lại trang HA Go2Joy để máy gửi phiên mới. Chi tiết: <…>`
- Mã kết nối sai: `Booking OTA: Google Sheet của khách sạn không nhận mã kết nối, nên phiên đăng nhập PMS máy gửi lúc <hh:mm> chưa được lưu. Máy đã báo Hub, báo Quản trị hệ thống nhập lại mã.`
- Chờ xác nhận: `Booking OTA: Phiên đăng nhập PMS máy gửi lúc <hh:mm> đang chờ Quản lý cơ sở xác nhận ở bước 2 trên Google Sheet của khách sạn.`

Sức khoẻ (②):

- `Booking OTA: ezCloud đã từ chối phiên đăng nhập PMS lúc <hh:mm>, <N> booking đang chờ vào ezCloud. Mở lại hoặc đăng nhập lại PMS để máy gửi phiên mới.`
- `Booking OTA: Phiên đăng nhập PMS mới đang chờ Quản lý cơ sở xác nhận ở bước 2 trên Google Sheet của khách sạn, <N> booking đang chờ vào ezCloud.`
- `Booking OTA: Google Sheet của khách sạn chưa có phiên đăng nhập PMS, <N> booking đang chờ vào ezCloud. Báo Quản trị hệ thống dán mã kết nối Booking OTA lên Hub.`

`<hh:mm>` khác ngày hôm nay ⇒ `<hh:mm> ngày <dd/mm>`. `N` = 0 ⇒ bỏ phần ", N booking …". Không có giờ ⇒ bỏ "lúc …".

Nút gập (đoạn thêm): `Phiên PMS bị từ chối` · `Phiên Go2Joy bị từ chối` · `Mã kết nối bị từ chối` ·
`Phiên PMS chờ xác nhận` · `Phiên Go2Joy chờ xác nhận` · `ezCloud từ chối phiên PMS` · `Sheet chưa có phiên PMS`
(đỏ khi lỗi).

## Test

ĐO: `npm test` ⇒ `# tests 376 # pass 376 # fail 0`. Mốc trước làn 356; sau ① 366; sau ② 373; sau ③ 376.
`test/token-ben.test.mjs` 20 ca:

- (a) chạy thật `quay/sw.js` với `chrome`, `fetch`, đồng hồ giả: từ chối ⇒ dòng còn sau 10 giây, sau lượt từ
  chối lặp lại (cùng token, 10 phút sau); lời 10 giây chỉ một lần; `saved` ⇒ hết. `pending` giữ tới `unchanged`.
- (b) `auth-failed` ⇒ dòng có giờ và số booking (mô hình và chạy thật `bookings`).
- (c) không có `tokenHealth` hay dạng lạ ⇒ không hiện, `bookings` vẫn `ok`.
- (d) `ok` ⇒ không hiện; lượt bảng khoá đọc sau nói `ok` ⇒ dòng hết.
- (e) chữ hiện không có JWT, URL, email, khoá dài; tin gửi tab PMS không chứa token đã đẩy.
- ③ `auth-failed` ⇒ có `TOKEN_REJECTED` (mô hình và chạy thật: lượt báo sống POST lên Hub giả mang mã, không
  mang khoá hay URL Web App); `ok`, `pending`, `missing`, không có trường, đã lưu token mới ⇒ không có.

## Đột biến (sau commit, phục hồi bằng `git checkout -- <tệp>`)

ĐO, lệnh `node --test test/token-ben.test.mjs test/hub-quay.test.mjs`:

| # | Đột biến | Kết quả |
|---|---|---|
| M1 | bỏ nhánh `pending` của lượt đẩy | 3 ca đỏ |
| M2 | bỏ lọc bí mật | 1 đỏ |
| M3 | chỉ ghi `quayTokenAt` khi lưu được | 1 đỏ |
| M4 | popup không nhận `tokens` | 2 đỏ |
| M5 | dòng tự hết sau 10 giây | 4 đỏ |
| M6 | tab Việc cần làm không vẽ dòng | 1 đỏ |
| M7 | `auth-failed` bỏ số booking chờ | 2 đỏ |
| M8 | nhận trạng thái lạ | 1 đỏ |
| M9 | `ok` vẫn hiện | 2 đỏ |
| M10 | bỏ luật "bản đọc cũ khi đã lưu token mới" | 1 đỏ |
| M11 | bảng khoá không cập nhật sức khoẻ | 1 đỏ |
| M12 | lượt gần đây không đọc `tokenHealth` | 1 đỏ |
| M13 | popup bỏ sức khoẻ | 1 đỏ |
| M14 | bỏ `auth-failed` khỏi `TOKEN_REJECTED` | 2 đỏ |
| M15 | `pending`/`missing` cũng báo | 1 đỏ |
| M16 | bỏ luật bản đọc cũ ở phần báo Hub | 1 đỏ |
| M17 | detail không thành câu | 2 đỏ |

M14 tới M17 chạy `node --test test/token-ben.test.mjs test/counter-problems.test.mjs`.

## Chưa kiểm được

- Chưa chạy trên Chrome thật với PMS thật: vị trí dòng trong khung, độ dài dòng trên màn quầy, nút gập dài
  thêm một đoạn có tràn không. Phần `ui.js` chỉ có test đọc mã nguồn, không có DOM.
- Chưa có lời đáp thật của Apps Script mới: chỉ thử theo hợp đồng trong PROMPT-LAN.
- Chưa thấy trên màn Máy quầy của Hub thật dòng detail mới hiện ra sao (Hub giữ detail của mã này, có cắt
  độ dài hay không thì chưa đo).

## Chỗ tự quyết, cần điều phối xem

- SUY: `missing` ⇒ "Báo Quản trị hệ thống dán mã kết nối Booking OTA lên Hub" theo đúng chữ PROMPT-LAN. Nếu
  `missing` còn có nghĩa "máy chưa gửi lần nào dù Hub có mã" thì câu này sai người.
- Thêm đoạn trên nút gập (ngoài chữ PROMPT-LAN): ca Linh Đan là không ai mở khung, nên nút gập cũng nói.
- Dùng chữ "booking" thay "đơn" cho khớp các dòng khác của khung.
