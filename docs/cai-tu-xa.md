# Cài extension cho khách sạn (Windows)

Cách cài này không qua Chrome Web Store. Người quản lý chuẩn bị một **mã cài đặt**, người cài
chạy **một lệnh** rồi bấm **bốn bước** trong Chrome. Muốn cập nhật thì chạy lại đúng lệnh đó.

Người cài có thể là nhân viên khách sạn tự làm theo trang này, hoặc người quản lý vào máy qua
UltraViewer/TeamViewer. Mỗi máy mất khoảng 5 phút.

## Người quản lý: tạo mã cài đặt

1. Mở Google Sheet "Review OTA — chuỗi", chọn menu **Review OTA › Tạo mã cài đặt cho khách sạn**.
   - Lần đầu, Sheet hỏi **URL Web App** (lấy ở Triển khai › Quản lý triển khai, đuôi `/exec`).
     Sheet nhớ URL này, các lần sau không hỏi lại.
2. Nhập **tên khách sạn**. Tên này là khoá của máy trong tab `Máy cài`, nên phải viết thống nhất.
   Hộp nhập liệt kê sẵn các tên đã có.
3. Nhập **các kênh** khách sạn có, cách nhau dấu phẩy, ví dụ `booking, agoda, trip, go2joy`.
4. Sheet hiện mã bắt đầu bằng `UBR1-`. Chép và **gửi riêng** cho khách sạn đó.

⚠️ Mã cài đặt chứa mã bí mật của Sheet. Ai có mã đều gửi được dữ liệu vào Sheet, nên chỉ gửi qua
tin nhắn riêng, không dán vào nhóm chung.

Mã không chứa mã khách sạn trên từng kênh (Booking, Agoda, Expedia). Khách sạn mà tài khoản
Booking thấy nhiều chỗ nghỉ thì sau khi cài vẫn phải điền mã Booking trong ô bật lên
(xem [cai-dat.md](cai-dat.md) mục 2).

## Người cài: trên máy khách sạn

**Bước 1: chạy lệnh cài.** Bấm phím Windows, gõ `PowerShell`, mở **Windows PowerShell** (không cần
"Run as administrator"), dán dòng dưới rồi bấm Enter:

```powershell
irm https://raw.githubusercontent.com/taiituan13/UrbanB-Thu-review-OTA/main/windows/cai-dat.ps1 | iex
```

Lệnh này tải extension vào `C:\UrbanB\extension`, chép sẵn đường dẫn thư mục, rồi in ra bốn
bước tiếp theo.

**Bước 2: nạp vào Chrome.**

1. Gõ vào thanh địa chỉ của Chrome: `chrome://extensions`
2. Bật **Chế độ dành cho nhà phát triển** (góc trên bên phải). Để bật mãi: tắt đi là Chrome tắt
   luôn extension.
3. Bấm **Tải tiện ích đã giải nén**. Trong hộp chọn thư mục, dán đường dẫn `C:\UrbanB\extension`
   vào ô địa chỉ rồi bấm **Chọn thư mục**.
4. Bấm biểu tượng mảnh ghép cạnh thanh địa chỉ, ghim **Thu review OTA**.

**Bước 3: dán mã cài đặt.** Bấm biểu tượng Thu review OTA, dán mã vào ô **Mã cài đặt**, bấm
**Áp dụng**. Extension điền tên khách sạn, URL, mã bí mật, bật đúng kênh, rồi tự thử gửi Sheet.
Dòng chữ xanh hiện "Sheet trả lời: …" là xong.

**Bước 4: quét lần đầu.** Đăng nhập sẵn các extranet trong **cùng Chrome đó**, rồi bấm
**Quét ngay**. Kênh nào báo cam thì đăng nhập lại kênh đó.

Máy đã cài bản giải nén từ thư mục khác trước đây: gỡ bản cũ trong `chrome://extensions` trước,
rồi làm lại từ bước 1.

## Cập nhật

Chạy lại đúng lệnh ở bước 1 trên máy cần cập nhật. Lệnh chép bản mới nhất đè lên
`C:\UrbanB\extension`; không phải làm lại bước 2 và 3. Extension tự kiểm thư mục mỗi 30 phút,
thấy bản trên đĩa mới hơn thì tự nạp lại (trừ khi đang quét dở), giữ nguyên cài đặt và mã máy.
Muốn chạy bản mới ngay: vào `chrome://extensions`, bấm nút nạp lại của Thu review OTA.

Cột *Phiên bản* của tab `Máy cài` cho biết máy nào đã lên bản mới.

Máy không tự tải bản mới: tác vụ hẹn giờ tự cập nhật đã **tạm bỏ** (08/10/2026). Máy nào từng
cài bằng lệnh bản 0.6.0 còn giữ tác vụ "UrbanB - cap nhat Thu review OTA"; chạy lại lệnh cài là
tác vụ đó bị gỡ.

## Khi có sự cố

| Dấu hiệu | Kiểm |
|---|---|
| Lệnh cài in chữ đỏ "Cài không xong" | Dòng cuối của `C:\UrbanB\cai-dat.log` ghi lý do. Thường là máy không vào được `github.com` |
| Tab `Máy cài` vẫn ở phiên bản cũ sau khi chạy lại lệnh cài | Chờ 30 phút, hoặc bấm nạp lại trong `chrome://extensions`. Vẫn cũ ⇒ Chrome đang nạp extension từ thư mục khác `C:\UrbanB\extension` |
| Extension biến mất hoặc xám trong `chrome://extensions` | Ai đó tắt Chế độ dành cho nhà phát triển. Bật lại là extension chạy lại, cài đặt còn nguyên |
| Chrome hiện cảnh báo về tiện ích ở chế độ nhà phát triển | Bấm đóng. Đừng bấm tắt tiện ích |

## Giới hạn

- Việc extension tự nạp lại khi thư mục có bản mới đã được đo trên Chromium với chế độ nhà phát
  triển bật: giữ cài đặt và mã máy (08/10/2026). Tệp `cai-dat.ps1` thì **chưa chạy thử trên máy
  Windows thật**. Máy đầu tiên nên do người quản lý cài và theo dõi.
- Lệnh cài tải mã từ repo GitHub công khai `taiituan13/UrbanB-Thu-review-OTA`, nhánh `main`.
