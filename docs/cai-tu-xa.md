# Cài extension cho khách sạn (Windows)

Cách cài này không qua Chrome Web Store. Người quản lý chuẩn bị một **mã cài đặt**, người cài
chạy **một lệnh** rồi bấm **bốn bước** trong Chrome. Sau đó máy tự cập nhật: mỗi lần repo có bản
mới, máy tự tải về trong vòng vài giờ, không ai phải vào máy nữa.

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

Lệnh này tải extension vào `C:\UrbanB\extension`, bật tự cập nhật, chép sẵn đường dẫn thư mục,
rồi in ra bốn bước tiếp theo.

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

## Tự cập nhật chạy thế nào

- Lệnh cài đăng ký tác vụ hẹn giờ **"UrbanB - cap nhat Thu review OTA"** trong Task Scheduler.
  Tác vụ chạy mỗi 3 giờ từ 7:00 tới 22:00; máy tắt lúc đó thì chạy bù khi bật lên. Mỗi lần chạy,
  cửa sổ PowerShell có thể loé lên rồi tắt ngay: đó là tác vụ này.
- Tác vụ so phiên bản trên GitHub với bản trên máy. Có bản mới hơn thì tải về, chép đè
  `C:\UrbanB\extension`, và ghi một dòng vào `C:\UrbanB\cap-nhat.log`. Không có bản mới thì
  không làm gì, kể cả không ghi log.
- Extension tự kiểm thư mục mỗi 30 phút. Thấy bản trên đĩa mới hơn thì tự nạp lại, trừ khi đang
  quét dở. Cài đặt đã điền và mã máy giữ nguyên.
- Chậm nhất khoảng 3,5 giờ sau khi bản mới được đẩy lên GitHub, máy chạy bản mới. Cột *Phiên bản*
  của tab `Máy cài` cho biết máy nào đã lên.

Muốn cập nhật ngay một máy: chạy lại lệnh cài ở bước 1. Lệnh này an toàn khi chạy lại: chỉ chép
đè cùng thư mục và đăng ký lại cùng tác vụ, không cần làm lại bước 2 và 3.

## Khi có sự cố

| Dấu hiệu | Kiểm |
|---|---|
| Lệnh cài in chữ đỏ "Cài không xong" | Dòng cuối của `C:\UrbanB\cap-nhat.log` ghi lý do. Thường là máy không vào được `github.com` |
| Tab `Máy cài` mãi ở phiên bản cũ | Mở `C:\UrbanB\cap-nhat.log`. Không có dòng nào gần đây ⇒ tác vụ hẹn giờ không chạy: mở Task Scheduler, tìm tác vụ "UrbanB - cap nhat…" |
| Extension biến mất hoặc xám trong `chrome://extensions` | Ai đó tắt Chế độ dành cho nhà phát triển. Bật lại là extension chạy lại, cài đặt còn nguyên |
| Chrome hiện cảnh báo về tiện ích ở chế độ nhà phát triển | Bấm đóng. Đừng bấm tắt tiện ích |

## Giới hạn

- Phần tự cập nhật đã được đo trên Chromium với chế độ nhà phát triển bật: chép bản mới đè lên
  thư mục thì extension tự nạp lại, giữ cài đặt và mã máy (08/10/2026). Tệp `cai-dat.ps1` thì
  **chưa chạy thử trên máy Windows thật**. Máy đầu tiên nên do người quản lý cài và theo dõi.
- Mọi máy tải mã từ repo GitHub công khai `taiituan13/UrbanB-Thu-review-OTA`, nhánh `main`.
  Đẩy lên `main` là phát hành: trong vài giờ, 15 máy chạy mã đó. Chạy `npm test` trước khi đẩy.
