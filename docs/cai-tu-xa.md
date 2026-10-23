# Cài extension cho khách sạn (Windows)

Cách cài này không qua Chrome Web Store. Từ bản 0.9.0, người quản lý tạo sẵn **một lệnh riêng cho
từng khách sạn** trong Sheet. Người ở khách sạn chỉ dán lệnh đó và bấm **bốn bước** trong Chrome;
extension tự điền Cài đặt và tự thử Sheet. Muốn cập nhật thì chạy lệnh cài thường (không cần mã).

**Từ bản 1.2.0** (`H-1527` a) Sheet thu review, tên khách sạn và mã chỗ nghỉ đặt trên Hub (màn Kết nối ›
tab Mã kết nối Booking OTA › khối Sheet review); máy tự nhận khi lễ tân đăng nhập Hub, ô bật lên không còn ô nhập tay hay ô Mã cài
đặt (xem [cai-dat.md](cai-dat.md) mục 2). Lệnh có mã vẫn chạy được: máy nhận mã từ tệp
`ma-cai-dat.txt` như cũ, nhưng cấu hình trong mã chỉ dùng khi Hub chưa có Sheet thu review. Hub đã có
thì chỉ cần lệnh chung.

Người cài có thể là nhân viên khách sạn tự làm theo trang này, hoặc người quản lý vào máy qua
UltraViewer/TeamViewer. Mỗi máy mất khoảng 3 phút.

## Người quản lý: tạo lệnh cài

1. Mở Google Sheet nhận review, menu **Review OTA › Tạo lệnh cài cho khách sạn**. Menu chưa có thì
   tải lại trang Sheet. Vẫn chưa có thì Code.gs trong Sheet còn là bản cũ: dán bản mới
   (xem [cai-dat.md](cai-dat.md) mục 1, triển khai **Phiên bản mới**, không chạy lại `setup`).
2. Điền:
   - **Tên khách sạn.** Tên này là khoá của máy trong tab `Máy cài`. Máy cài lại thì chọn đúng tên
     trong danh sách gợi ý.
   - **Kênh** khách sạn có (Booking, Agoda, Trip bật sẵn).
   - **URL Web App**: điền một lần (Triển khai › Quản lý triển khai, đuôi `/exec`), lần sau tự điền.
   - **URL Hub** và **Token Hub** trong hộp thoại: từ bản extension 1.1.0 không cần nữa, để trống.
     Review lên Hub theo phiên đăng nhập Hub của lễ tân (xem [cai-dat.md](cai-dat.md) mục 6).
   - **Mã Booking** khi tài khoản Booking thấy nhiều chỗ nghỉ (xem [cai-dat.md](cai-dat.md) mục 2).
3. Bấm **Tạo lệnh**, rồi **Chép lệnh** và gửi cho người cài. Lệnh có dạng
   `$UrbanBMa='URB1.…'; irm https://raw.githubusercontent.com/…/cai-dat.ps1 | iex`.

⚠️ Lệnh chứa mã bí mật của Sheet (và token Hub). Ai có lệnh đều gửi được dữ liệu vào Sheet, nên
chỉ gửi qua tin nhắn riêng, không dán vào nhóm chung.

Máy **đã cài** extension muốn đổi cài đặt: từ bản 1.2.0 đổi trên Hub (màn Kết nối › Extension máy
quầy). Hub chưa có Sheet thu review thì chạy lại cả lệnh có mã: extension nhận mã mới trong vòng 30
phút, hoặc ngay khi mở ô bật lên. Phần **Chỉ mã** chỉ dán được vào máy còn chạy bản trước 1.2.0.

Mã mang **đủ** cài đặt: ô nào để trống trong hộp thoại thì áp vào máy cũng thành trống, kênh không
tick thì tắt. Chu kỳ quét của máy giữ nguyên.

## Người cài: trên máy khách sạn

**Bước 1: chạy lệnh cài.** Bấm phím Windows, gõ `PowerShell`, mở **Windows PowerShell** (không cần
"Run as administrator"), dán lệnh người quản lý gửi rồi bấm Enter. Không có lệnh riêng thì dùng
lệnh chung dưới đây (cấu hình thu review khi đó lấy từ Hub ở bước 3):

```powershell
irm https://raw.githubusercontent.com/taiituan13/UrbanB-Thu-review-OTA/main/windows/cai-dat.ps1 | iex
```

Lệnh này tải extension vào `C:\UrbanB\extension`, ghi mã cài đặt (nếu lệnh có) vào
`C:\UrbanB\extension\ma-cai-dat.txt`, in tên khách sạn trong mã, chép sẵn đường dẫn thư mục, rồi
in ra bốn bước tiếp theo.

**Bước 2: nạp vào Chrome.**

1. Gõ vào thanh địa chỉ của Chrome: `chrome://extensions`
2. Bật **Chế độ dành cho nhà phát triển** (góc trên bên phải). Để bật mãi: tắt đi là Chrome tắt
   luôn extension.
3. Bấm **Tải tiện ích đã giải nén**. Trong hộp chọn thư mục, dán đường dẫn `C:\UrbanB\extension`
   vào ô địa chỉ rồi bấm **Chọn thư mục**.
4. Bấm biểu tượng mảnh ghép cạnh thanh địa chỉ, ghim **Thu review OTA**.

**Bước 3: kiểm cài đặt.** Bấm biểu tượng UrbanB, bấm **Đăng nhập Hub** và đăng nhập bằng tài khoản
lễ tân của cơ sở (hoặc mở màn **Cài extension** trên Hub). Tài khoản nhiều cơ sở thì chọn cơ sở của
máy. Khối **Cài đặt**, mục **Thu review OTA**, cho biết Sheet, tên khách sạn, kênh và mã chỗ nghỉ lấy
từ Hub hay từ cấu hình cũ. Bấm **Thử Sheet**: dòng chữ hiện "Sheet trả lời: …" là xong.

- Ô bật lên báo **"Hub chưa có cấu hình thu review"**: Quản trị hệ thống chưa điền Sheet thu review
  trên Hub. Máy có cấu hình cũ (lệnh có mã) thì vẫn chạy bằng cấu hình đó.
- Dòng báo **Lỗi Sheet** thay vì "Sheet trả lời": URL Web App trên Hub sai, hoặc Web App chưa để
  quyền "Bất kỳ ai".

Đủ cấu hình thì từ lần mở sau khối Cài đặt gập lại. Phần trên cùng chỉ hiện các kênh đang bật, nút **Quét
ngay**, và mã lỗi kèm nút **Sao chép** khi có kênh hỏng.

**Bước 4: quét lần đầu.** Đăng nhập sẵn các extranet trong **cùng Chrome đó**, rồi bấm
**Quét review ngay**. Kênh nào báo cam thì đăng nhập lại kênh đó.

Máy đã cài bản giải nén từ thư mục khác trước đây: gỡ bản cũ trong `chrome://extensions` trước,
rồi làm lại từ bước 1.

## Cập nhật

Từ bản 0.8.1, extension tự đọc số phiên bản mới nhất trên GitHub (mỗi 30 phút và mỗi lần mở ô
bật lên). Có bản mới thì ô bật lên hiện dải vàng **"Có bản mới …"** kèm nút **Chép lệnh cập
nhật** và ba bước làm. Khối Cài đặt cũng luôn có lệnh này ở cuối, kèm dòng cho biết máy đang chạy
bản nào. Extension không tự chạy được PowerShell, nên vẫn phải có người dán lệnh. Máy còn chạy bản
cũ hơn 0.8.1 thì không có dải này: chạy lệnh tay một lần.

Chạy lại đúng lệnh ở bước 1 trên máy cần cập nhật. Lệnh chép bản mới nhất đè lên
`C:\UrbanB\extension`; không phải làm lại bước 2 và 3. Extension tự kiểm thư mục mỗi 30 phút,
thấy bản trên đĩa mới hơn thì tự nạp lại (trừ khi đang quét dở), giữ nguyên cài đặt và mã máy.
Muốn chạy bản mới ngay: mở lại ô bật lên của Thu review OTA (từ 0.8.1, ô tự đóng một
nhịp rồi bản mới chạy), hoặc vào `chrome://extensions` và bấm nút nạp lại.

Cột *Phiên bản* của tab `Máy cài` cho biết máy nào đã lên bản mới.

Máy không tự tải bản mới: tác vụ hẹn giờ tự cập nhật đã **tạm bỏ** (08/10/2026). Máy nào từng
cài bằng lệnh bản 0.6.0 còn giữ tác vụ "UrbanB - cap nhat Thu review OTA"; chạy lại lệnh cài là
tác vụ đó bị gỡ.

## Khi có sự cố

| Dấu hiệu | Kiểm |
|---|---|
| Lệnh cài in chữ đỏ "Cài không xong" | Dòng cuối của `C:\UrbanB\cai-dat.log` ghi lý do. Thường là máy không vào được `github.com`, hoặc lệnh có mã bị cắt khi chép (chép lại nguyên dòng) |
| Ô bật lên báo "Chưa nhận cấu hình thu review từ Hub" | Lễ tân chưa đăng nhập Hub trên máy. Bấm Đăng nhập Hub, hoặc mở màn Cài extension trên Hub |
| Tab `Máy cài` vẫn ở phiên bản cũ sau khi chạy lại lệnh cài | Chờ 30 phút, hoặc bấm nạp lại trong `chrome://extensions`. Vẫn cũ ⇒ Chrome đang nạp extension từ thư mục khác `C:\UrbanB\extension` |
| Extension biến mất hoặc xám trong `chrome://extensions` | Ai đó tắt Chế độ dành cho nhà phát triển. Bật lại là extension chạy lại, cài đặt còn nguyên |
| Chrome hiện cảnh báo về tiện ích ở chế độ nhà phát triển | Bấm đóng. Đừng bấm tắt tiện ích |

## Giới hạn

- Việc extension tự nạp lại khi thư mục có bản mới đã được đo trên Chromium với chế độ nhà phát
  triển bật: giữ cài đặt và mã máy (08/10/2026). Tệp `cai-dat.ps1` thì **chưa chạy thử trên máy
  Windows thật**. Máy đầu tiên nên do người quản lý cài và theo dõi.
- Lệnh cài tải mã từ repo GitHub công khai `taiituan13/UrbanB-Thu-review-OTA`, nhánh `main`.
