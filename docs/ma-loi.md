# Mã lỗi

Mỗi lỗi của extension mang hai mã:

| Mã | Ví dụ | Dùng để |
|---|---|---|
| **Mã lỗi** | `E-7K3QX2` | Duy nhất cho từng lần lỗi. Khách sạn gửi mã này cho người quản lý. |
| **Loại lỗi** | `BKG-LOGIN` | Cố định theo nguyên nhân. Tra cách xử lý ở bảng dưới. |

Mã lỗi không chứa các ký tự dễ đọc nhầm (`0 O 1 I L`), nên đọc qua điện thoại hay gõ lại
từ ảnh chụp cũng không sai.

## Phía khách sạn: gửi mã lỗi thế nào

Từ bản 1.4.0 (YC-158), lỗi thu review hiện ở ba nơi với **cùng một lời hướng dẫn**:

- tab **Cần xử lý** của khung Urban B trên PMS, khối **Thu review** (lễ tân không phải bấm icon);
- ô bật lên khi bấm biểu tượng Urban B trên thanh Chrome;
- màn **Cài extension** trên Hub, khối "Kiểm máy này", danh sách từng kênh.

Mỗi lời hướng dẫn có ba phần: **chuyện gì đang xảy ra**, **vì sao**, và **làm gì tiếp theo** theo từng
bước có số. Chữ nằm ở `SHEET_KINDS`, `HUB_KINDS`, `CHANNEL_KINDS` trong `extension/report.js`; cột
"Khách sạn tự làm" ở bảng dưới chỉ là bản tóm tắt.

1. Làm theo các bước trong khung đỏ, rồi bấm **Quét review ngay** (trên khung PMS hoặc trong ô bật lên).
2. Vẫn lỗi thì bấm **Sao chép** cạnh mã lỗi rồi dán vào tin nhắn gửi người quản lý. Ở ô bật lên, đoạn
   chép gồm mã lỗi, loại lỗi, tên khách sạn, mã máy, phiên bản, giờ lỗi và thông điệp lỗi. Đoạn này
   không chứa mật khẩu hay mã phiên.

Tới bản 1.5.1, lỗi gửi Sheet (sai mã bí mật, sai URL…) hiện riêng trong khung **Lỗi gửi Sheet** ở cuối
ô bật lên. Từ bản 1.5.2 máy không ghi Sheet nên khung này bỏ; dấu lỗi Sheet cũ tự xoá khi lên bản.

Huy hiệu trên biểu tượng Chrome: số thông báo chưa đọc, kèm dấu `!` khi máy có việc cần xem (vd. `3!`).
Từ bản 1.4.0 số không còn che dấu `!`.

### Hạn giờ (từ 1.4.0)

Mọi lượt gọi ra ngoài đều có hạn giờ, nên không còn lượt quét im hẳn: gửi Hub 30 giây, lượt gọi API
review của kênh 30 giây, lượt chạy trong trang 120 giây, kiểm bản mới 15 giây
(`extension/quay/net.js`). Hết giờ thì báo `HUB-NET` hoặc `<kênh>-TIMEOUT` (tới 1.5.1 còn gửi Sheet
90 giây, hết giờ báo `SHEET-NET`). Lượt quét hẹn
giờ ném lỗi ra ngoài thì ghi nhật ký ở giai đoạn `lượt quét` và giữ dấu `!` tới lượt quét chạy xong kế tiếp.

## Phía người quản lý: tra mã

Từ bản 1.5.2 máy không gửi nhật ký lỗi lên Sheet: chi tiết lỗi nằm trong đoạn chữ khách sạn bấm
**Sao chép** gửi cho bạn, và các lỗi máy đang hiện lên Hub theo lượt báo (từ 1.5.0). Các bước dưới đây
chỉ còn tìm được mã của máy chạy bản tới 1.5.1.

1. Mở tab **Nhật ký lỗi**, bấm Ctrl+F (Cmd+F trên Mac), dán mã `E-…`.
   Dòng tìm được có đủ thông tin: trang lúc lỗi (đã bỏ phần sau dấu `?`), giai đoạn,
   chi tiết kỹ thuật (stack).
2. Mã cũng nằm trong cột *Ghi chú* của tab **Lượt quét** và cột *Lỗi gần nhất* của tab
   **Máy cài**, nên Ctrl+F trên cả Sheet sẽ thấy đủ ba nơi.
3. Không tìm thấy mã? Lỗi chưa tới Sheet, thường do chính việc gửi Sheet đang hỏng
   (loại `SHEET-…`). Lỗi nằm chờ trong máy và lên Sheet ở lượt gửi thành công kế tiếp.
   Trong lúc chờ, đoạn chữ khách sạn dán gửi đã đủ để chẩn đoán.

## Danh mục loại lỗi

Tiền tố kênh: `BKG` Booking · `AGD` Agoda · `TRP` Trip · `EXP` Expedia · `TVL` Traveloka · `G2J` Go2Joy.
Các loại không có tiền tố kênh bắt đầu bằng `SHEET` (gửi Sheet, tới bản 1.5.1) hoặc `HUB` (gửi Hub UrbanB).

### Lỗi theo kênh (`<kênh>-…`)

| Loại | Nghĩa | Khách sạn tự làm | Người quản lý kiểm |
|---|---|---|---|
| `-LOGIN` | Extranet đá về trang đăng nhập (phiên hết hạn) | Đăng nhập lại kênh đó trong cùng Chrome, bấm Quét review ngay | Lặp lại liên tục ở Booking: phiên Booking hết sau khoảng 2 giờ không dùng (xem `cai-dat.md` §5) |
| `-MULTI` | Tài khoản thấy nhiều chỗ nghỉ, extension không biết chọn cái nào | Gửi mã lỗi | Thông điệp lỗi liệt kê sẵn các mã thấy được ⇒ điền mã kênh đó của chi nhánh trên Hub |
| `-NOID` | Không dò được mã khách sạn (Agoda, Expedia) | Gửi mã lỗi | Điền mã kênh đó của chi nhánh trên Hub. Agoda: trang chủ đổi đường dẫn ⇒ sửa `scanAgoda`. Expedia: trang đích không có `htid` trong URL lẫn trong link ⇒ xem `scanExpedia` (cả hai trong `background.js`) |
| `-PAGE` | Trang kênh tự chuyển đi chỗ khác thay vì trang review, hoặc chuyển đi giữa lúc đang quét | Mở trang review của kênh xem có vào được không; kênh có ô mã khách sạn thì kiểm lại ô đó | Thông điệp ghi đường dẫn trang đích. Ví dụ Expedia đá sang `/supply/inbox` khi chưa chọn chỗ nghỉ (09/10/2026) |
| `-OPEN` | Trang kênh không mở được: tab vẫn trống sau hai lượt mở, hoặc Chrome hiện trang lỗi của nó | Đừng bấm dừng hay đóng tab mà extension tự mở. Vẫn lỗi thì mở kênh đó trong Chrome này xem có vào được không | Tab trống: người dùng bấm ✕/Esc trên tab trắng, hoặc lượt mở bị huỷ (tiện ích chặn, phần mềm bảo mật, trang trả 204). Trang lỗi: mất mạng hoặc bị chặn. Extension đã tự mở lại một lần trước khi báo |
| `-TIMEOUT` | Trang không tải xong trong 45 giây, hoặc kênh không trả lời trong hạn giờ | Kiểm mạng, bấm Quét review ngay | Lặp lại ở một kênh: kênh chậm hoặc chặn tab nền |
| `-TAB` | Tab nền bị đóng giữa chừng, kể cả lúc trang đang tải (từ 0.8.2; trước đó ca này báo nhầm `-TIMEOUT` sau 45 giây) | Đừng đóng tab mà extension tự mở | Thường do người dùng đóng tay; không cần sửa mã |
| `-CAPTURE` | Không bắt được request review của trang | Mở trang review của kênh xem có tải được không | Xem cột *Trang lúc lỗi*: trang bị chuyển hướng đi đâu. Kênh đổi giao diện ⇒ sửa `scanners.js` hoặc mẫu trong `capture.js` |
| `-HTTP` | API review của kênh trả mã HTTP lỗi | Gửi mã lỗi | 401/403: phiên hỏng nửa chừng. 400: kênh đổi định dạng yêu cầu ⇒ sửa `scanners.js` |
| `-API` | Kênh trả lời nhưng báo lỗi trong nội dung | Gửi mã lỗi | Thông điệp chứa nguyên văn lỗi của kênh |
| `-NORM` | Một số bài không chuẩn hoá được; các bài khác vẫn gửi | Không cần làm gì | Cột *Chi tiết* có 5 lỗi đầu ⇒ sửa `normalize.js` |
| `-SCAN` | Lỗi chưa được xếp loại | Gửi mã lỗi | Đọc *Chi tiết*; gặp nhiều lần thì thêm một loại mới vào `report.js` và bảng này |

### Lỗi gửi Sheet (`SHEET-…`)

Từ bản 1.5.2 máy không gửi Sheet nên không còn lỗi gửi Sheet. Riêng lỗi không thuộc kênh nào (lượt quét
hỏng giữa chừng, giai đoạn `lượt quét`) vẫn được xếp vào nhóm này, thường là `SHEET-REJECT`, và lời
hướng dẫn còn nói về bảng tính: chữ cũ, chưa sửa.

| Loại | Nghĩa | Khách sạn tự làm | Người quản lý kiểm |
|---|---|---|---|
| `SHEET-CONFIG` | Máy chưa có đủ Sheet thu review, mã bí mật, tên khách sạn (Hub chưa có cấu hình thu review, hoặc máy chưa đăng nhập Hub) | Đăng nhập Hub, chọn chi nhánh nếu được hỏi, bấm Thử Sheet | Điền Sheet thu review ở màn Kết nối › Extension máy quầy trên Hub |
| `SHEET-SECRET` | Sheet từ chối mã bí mật | Gửi mã lỗi | Mã bí mật trên Hub khớp Script Property `SECRET` của Sheet? Sửa trên Hub, máy tự nhận lại |
| `SHEET-NET` | Không gọi được tới Google | Kiểm mạng | — |
| `SHEET-URL` | Google trả trang lỗi thay vì JSON, cả 3 lần gửi | Kiểm URL kết thúc bằng `/exec` | Đúng URL mà vẫn lỗi: bản triển khai bị lưu trữ, hoặc quyền không còn là "Bất kỳ ai" |
| `SHEET-BUSY` | Sheet đang bận (khoá ghi quá 60 giây) | Không cần làm gì, lượt sau tự gửi | Lặp lại nhiều: quá nhiều máy quét cùng lúc |
| `SHEET-OLD` | Sheet không hiểu yêu cầu | Gửi mã lỗi | Web App đang chạy `Code.gs` cũ ⇒ triển khai **Phiên bản mới** |
| `SHEET-REJECT` | Sheet từ chối vì lý do khác | Gửi mã lỗi | Thông điệp chứa câu trả lời của Sheet |

### Lỗi gửi Hub (`HUB-…`)

Từ bản 1.1.0 review lên Hub theo phiên đăng nhập Hub của người dùng máy, không còn URL Hub hay Token
Hub. Từ bản 1.2.0 máy dùng Hub của trang Cài extension mở gần nhất (ô bật lên ghi "Hub đang dùng"). Lỗi Hub không làm kênh đỏ: kênh vẫn xanh vì quét được, dòng Hub dưới kênh báo lỗi.

| Loại | Nghĩa | Khách sạn tự làm | Người quản lý kiểm |
|---|---|---|---|
| `HUB-LOGIN` | Chưa đăng nhập Hub, hoặc phiên Hub đã hết (401 `NOT_SIGNED_IN`) | Bấm Đăng nhập Hub trong ô Urban B, đăng nhập rồi bấm Quét review ngay | — |
| `HUB-SCOPE` | Tài khoản đang đăng nhập không có quyền thêm review ở cơ sở nào (403), hoặc Hub trả nhóm `rejected`: mã khách sạn của kênh đã ghép vào cơ sở mà tài khoản không được gán | Đăng nhập đúng tài khoản lễ tân của cơ sở | Cột *Chi tiết* có kênh và mã khách sạn bị từ chối. Mã ghép sai cơ sở ⇒ đổi ghép trên Hub; người dùng thiếu quyền ⇒ gán cơ sở ở màn Phân quyền |
| `HUB-ORIGIN` | Hub chặn vì không nhận ra nguồn gửi (403 `FORBIDDEN_ORIGIN`) | Chạy lệnh cập nhật extension | Extension gửi từ service worker nên mang `Origin: chrome-extension://…`; lỗi này nghĩa là luật chặn gọi chéo nguồn của Hub đã đổi |
| `HUB-OFF` | Hub chưa mở cửa nhận review (404 không phải JSON) | Gửi mã lỗi | Hub đang chạy bản chưa có route `/api/ingest/reviews` |
| `HUB-NET` | Không gọi được tới Hub | Kiểm mạng; lượt sau tự gửi lại | Hub sập hoặc tên miền không phân giải được |
| `HUB-ROWS` | Hub nhận lô nhưng từ chối một số bài | Không cần làm gì | Cột *Chi tiết* có 5 bài đầu kèm mã lỗi dòng của Hub (`SCALE_MISMATCH`, `ID_TOO_LONG`…) |
| `HUB-REJECT` | Hub từ chối vì lý do khác (400, 413, 5xx sau 3 lần) | Gửi mã lỗi | Thông điệp chứa câu trả lời của Hub |

Bài của mã khách sạn chưa ghép với cơ sở nào không phải lỗi: Hub nhận vào chỗ chờ ghép, ô bật lên
hiện "N chờ ghép". Quản trị hệ thống ghép mã trên Hub thì bài vào đúng cơ sở.

## Thêm một loại lỗi

1. Thêm một dòng vào `SHEET_KINDS`, `HUB_KINDS` hoặc `CHANNEL_KINDS` trong `extension/report.js`.
   Luật đầu tiên khớp sẽ thắng, nên đặt luật hẹp lên trước luật rộng.
2. Thêm một ca vào test "Loại lỗi" trong `test/report.test.mjs`.
3. Thêm một dòng vào bảng trên.

Bản extension cũ hơn 0.4.0 gửi lỗi không kèm mã, nên hai cột *Mã lỗi* và *Loại lỗi* để
trống ở các dòng đó.
