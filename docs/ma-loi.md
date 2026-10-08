# Mã lỗi

Mỗi lỗi của extension mang hai mã:

| Mã | Ví dụ | Dùng để |
|---|---|---|
| **Mã lỗi** | `E-7K3QX2` | Duy nhất cho từng lần lỗi. Khách sạn gửi mã này cho người quản lý. |
| **Loại lỗi** | `BKG-LOGIN` | Cố định theo nguyên nhân. Tra cách xử lý ở bảng dưới. |

Mã lỗi không chứa các ký tự dễ đọc nhầm (`0 O 1 I L`), nên đọc qua điện thoại hay gõ lại
từ ảnh chụp cũng không sai.

## Phía khách sạn: gửi mã lỗi thế nào

1. Bấm biểu tượng "Thu review OTA". Kênh lỗi có khung đỏ với dòng **Mã lỗi E-…**, kèm
   một câu hướng dẫn tự xử lý.
2. Làm theo câu hướng dẫn trước (ví dụ: đăng nhập lại rồi bấm **Quét ngay**).
3. Vẫn lỗi thì bấm **Sao chép** rồi dán vào tin nhắn gửi người quản lý. Đoạn chép gồm mã
   lỗi, loại lỗi, tên khách sạn, mã máy, phiên bản, giờ lỗi và thông điệp lỗi. Đoạn này
   không chứa mật khẩu, mã phiên hay mã bí mật của Sheet.

Lỗi gửi Sheet (sai mã bí mật, sai URL…) không thuộc kênh nào, nên hiện riêng trong khung
**Lỗi gửi Sheet** ở cuối ô bật lên. Khung này tự mất khi Sheet nhận được lại.

## Phía người quản lý: tra mã

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
Các loại không có tiền tố kênh bắt đầu bằng `SHEET`.

### Lỗi theo kênh (`<kênh>-…`)

| Loại | Nghĩa | Khách sạn tự làm | Người quản lý kiểm |
|---|---|---|---|
| `-LOGIN` | Extranet đá về trang đăng nhập (phiên hết hạn) | Đăng nhập lại kênh đó trong cùng Chrome, bấm Quét ngay | Lặp lại liên tục ở Booking: phiên Booking hết sau khoảng 2 giờ không dùng (xem `cai-dat.md` §5) |
| `-MULTI` | Tài khoản thấy nhiều chỗ nghỉ, extension không biết chọn cái nào | Điền mã khách sạn của kênh trong ô cài đặt | Thông điệp lỗi liệt kê sẵn các mã thấy được |
| `-NOID` | Không dò được mã khách sạn (Agoda) | Điền mã Agoda trong ô cài đặt | Trang chủ Agoda đổi đường dẫn ⇒ sửa `scanAgoda` trong `background.js` |
| `-TIMEOUT` | Trang không tải xong trong 45 giây | Kiểm mạng, bấm Quét ngay | Lặp lại ở một kênh: kênh chậm hoặc chặn tab nền |
| `-TAB` | Tab nền bị đóng giữa chừng | Đừng đóng tab mà extension tự mở | Thường do người dùng đóng tay; không cần sửa mã |
| `-CAPTURE` | Không bắt được request review của trang | Mở trang review của kênh xem có tải được không | Xem cột *Trang lúc lỗi*: trang bị chuyển hướng đi đâu. Kênh đổi giao diện ⇒ sửa `scanners.js` hoặc mẫu trong `capture.js` |
| `-HTTP` | API review của kênh trả mã HTTP lỗi | Gửi mã lỗi | 401/403: phiên hỏng nửa chừng. 400: kênh đổi định dạng yêu cầu ⇒ sửa `scanners.js` |
| `-API` | Kênh trả lời nhưng báo lỗi trong nội dung | Gửi mã lỗi | Thông điệp chứa nguyên văn lỗi của kênh |
| `-NORM` | Một số bài không chuẩn hoá được; các bài khác vẫn gửi | Không cần làm gì | Cột *Chi tiết* có 5 lỗi đầu ⇒ sửa `normalize.js` |
| `-SCAN` | Lỗi chưa được xếp loại | Gửi mã lỗi | Đọc *Chi tiết*; gặp nhiều lần thì thêm một loại mới vào `report.js` và bảng này |

### Lỗi gửi Sheet (`SHEET-…`)

| Loại | Nghĩa | Khách sạn tự làm | Người quản lý kiểm |
|---|---|---|---|
| `SHEET-CONFIG` | Chưa điền đủ tên khách sạn, URL, mã bí mật | Điền đủ, bấm Thử Sheet | — |
| `SHEET-SECRET` | Sheet từ chối mã bí mật | Dán lại mã bí mật đúng | Mã bí mật vừa đổi? Gửi lại mã mới cho mọi máy |
| `SHEET-NET` | Không gọi được tới Google | Kiểm mạng | — |
| `SHEET-URL` | Google trả trang lỗi thay vì JSON, cả 3 lần gửi | Kiểm URL kết thúc bằng `/exec` | Đúng URL mà vẫn lỗi: bản triển khai bị lưu trữ, hoặc quyền không còn là "Bất kỳ ai" |
| `SHEET-BUSY` | Sheet đang bận (khoá ghi quá 60 giây) | Không cần làm gì, lượt sau tự gửi | Lặp lại nhiều: quá nhiều máy quét cùng lúc |
| `SHEET-OLD` | Sheet không hiểu yêu cầu | Gửi mã lỗi | Web App đang chạy `Code.gs` cũ ⇒ triển khai **Phiên bản mới** |
| `SHEET-REJECT` | Sheet từ chối vì lý do khác | Gửi mã lỗi | Thông điệp chứa câu trả lời của Sheet |

## Thêm một loại lỗi

1. Thêm một dòng vào `SHEET_KINDS` hoặc `CHANNEL_KINDS` trong `extension/report.js`.
   Luật đầu tiên khớp sẽ thắng, nên đặt luật hẹp lên trước luật rộng.
2. Thêm một ca vào test "Loại lỗi" trong `test/report.test.mjs`.
3. Thêm một dòng vào bảng trên.

Bản extension cũ hơn 0.4.0 gửi lỗi không kèm mã, nên hai cột *Mã lỗi* và *Loại lỗi* để
trống ở các dòng đó.
