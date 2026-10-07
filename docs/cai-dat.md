# Cài đặt: extension thu review → Google Sheet

Mỗi khách sạn cài một bản extension trên máy đang đăng nhập sẵn các extranet
(Booking, Agoda, Trip). Mọi bản cài cùng ghi vào **một** Google Sheet chung.
Extension chỉ đọc: nó không trả lời review, không đổi cài đặt nào trên extranet.

## 1. Tạo Google Sheet và điểm nhận (làm một lần, ở máy quản lý)

1. Tạo một Google Sheet mới, ví dụ đặt tên "Review OTA — chuỗi".
2. Mở **Tiện ích mở rộng › Apps Script**. Xoá nội dung có sẵn, dán toàn bộ
   `apps-script/Code.gs`, rồi bấm Lưu.
3. Chọn hàm `setup` ở thanh trên, bấm **Chạy**. Lần đầu Google sẽ hỏi quyền truy cập
   Sheet; chấp nhận.
   - Hàm tạo bốn tab: `Review`, `Điểm hạng mục`, `Lượt quét`, `Điểm tổng hợp`.
   - Mở **Nhật ký thực thi** để chép dòng *"Mã bí mật (dán vào extension): …"*.
4. Bấm **Triển khai › Tùy chọn triển khai mới › Ứng dụng web**:
   - Thực thi dưới tên: **Tôi**
   - Người có quyền truy cập: **Bất kỳ ai**
5. Chép **URL ứng dụng web** (kết thúc bằng `/exec`).

"Bất kỳ ai" chỉ có nghĩa là URL nhận được yêu cầu. Yêu cầu không mang đúng mã bí mật
sẽ bị từ chối, và Sheet vẫn chỉ người được chia sẻ mới xem được.

Sửa `Code.gs` về sau thì phải **Quản lý triển khai › Chỉnh sửa › Phiên bản mới**.
Không làm bước này thì URL vẫn chạy mã cũ.

## 2. Cài extension trên máy từng khách sạn

1. Chép thư mục `extension/` sang máy.
2. Mở `chrome://extensions`, bật **Chế độ dành cho nhà phát triển**, bấm
   **Tải tiện ích đã giải nén** rồi chọn thư mục `extension/`.
3. Ghim biểu tượng "Thu review OTA", bấm vào rồi điền:
   - **Tên khách sạn**: ghi vào cột "Khách sạn". Mỗi máy một tên, viết thống nhất.
   - **URL Web App** và **Mã bí mật**: lấy từ bước 1.
   - **Kênh quét**: bỏ chọn kênh mà khách sạn không có.
   - **Mã Booking**: chỉ cần điền khi tài khoản Booking thấy nhiều chỗ nghỉ.
   - **Mã Agoda**: để trống thì extension tự dò.
4. Bấm **Thử Sheet**. Đúng thì hiện tên Sheet.
5. Bấm **Quét ngay**. Extension mở từng extranet trong một tab nền, đọc review, đóng
   tab, rồi gửi lên Sheet. Mỗi kênh mất khoảng nửa phút đến vài phút.

Sau đó extension tự quét theo số giờ đã đặt (mặc định 6 giờ), miễn là Chrome đang mở.

## 3. Đọc trạng thái

Ô bật lên có ba đèn, một đèn cho mỗi kênh:

| Đèn | Nghĩa | Làm gì |
|---|---|---|
| Xanh | Lượt gần nhất ổn | Không cần làm gì |
| Cam | Kênh đã đá về trang đăng nhập | Mở extranet đó, đăng nhập lại, bấm Quét ngay |
| Đỏ | Lỗi khác (đọc dòng chữ dưới tên kênh) | Gửi ảnh chụp cho người phụ trách |

Biểu tượng có dấu `!` đỏ khi có ít nhất một kênh không xanh. Tab `Lượt quét` trong
Sheet ghi mọi lượt của mọi khách sạn, kể cả lượt lỗi, nên người quản lý xem được
máy nào đang im mà không cần tới tận nơi.

## 4. Dữ liệu trong Sheet

- **Thống kê** (tab đầu): tự tính lại sau mỗi lượt quét; bấm tay qua menu
  **Review OTA › Cập nhật thống kê**. Gồm ba bảng: theo khách sạn (có dòng toàn
  chuỗi), theo khách sạn × kênh (có lượt quét gần nhất), và điểm hạng mục 90 ngày.
  Muốn đổi cửa sổ 30/90 ngày thì sửa hằng `STATS` ở đầu phần thống kê trong `Code.gs`.
- **Review**: mỗi bài một dòng. Khoá là `kênh|mã review`. Quét lại bài đã có thì
  không thêm dòng mới; nếu nội dung đổi (khách sửa bài, khách sạn trả lời) thì dòng
  được cập nhật, và cột "Lần cuối thấy" luôn được dời.
- **Điểm hạng mục**: điểm từng hạng mục của từng bài, giữ **tên gốc** của kênh.
  Agoda không có điểm hạng mục theo bài.
- **Điểm tổng hợp**: điểm hạng mục cấp khách sạn mà kênh tự tính (hiện chỉ Agoda).
  Mỗi lượt quét thêm một bộ dòng, nên xem được điểm đi lên hay đi xuống.
- **Lượt quét**: nhật ký.

Tên khách bị gỡ trước khi gửi. Mã đặt phòng thì vẫn giữ, vì đó là thứ nối review về
lượt lưu trú.

Thang điểm: Booking, Agoda và Trip đều dùng thang 10. Cột "Thang" vẫn được ghi để
sau này thêm kênh khác thang không phải sửa dữ liệu cũ.

## 5. Giới hạn đã biết

- Phiên Booking hết hạn sau khoảng 2 giờ không dùng. Nếu máy chỉ mở Chrome mà không
  ai đụng tới extranet, kênh Booking sẽ thường xuyên báo cam.
- Trip mới đọc nguồn Trip.com (`channelSource = 1`); bài từ Qunar/Ly.com chưa thu.
- Endpoint là API nội bộ của extranet, đo ngày 07/10/2026. Kênh đổi giao diện thì
  extension sẽ báo đỏ, và phải sửa `extension/scanners.js`.
