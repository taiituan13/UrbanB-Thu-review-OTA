# Ghi chú phát hành

Mỗi bản một mục, bản mới nhất ở trên. Viết cho người vận hành: máy quầy thay đổi gì, lễ tân và
quản lý thấy gì khác. Máy đã cài không tự lên bản: khi có bản mới, ô bật lên hiện dải vàng
"Có bản mới …" và phải có người chạy lại lệnh cài (xem [docs/cai-tu-xa.md](docs/cai-tu-xa.md) mục
Cập nhật).

## 1.5.1

Sửa lỗi máy mới cài vắng mặt trên Hub hơn 3 giờ (YC-213). Máy vừa cài hẹn lượt quét đầu sau
khoảng 5 phút, nhưng một phút sau, khi nhận chu kỳ quét từ Hub mà chu kỳ đó khác chu kỳ máy đang
dùng, máy hẹn lại lượt quét kế tiếp sau trọn chu kỳ mới. Lượt quét đầu vì thế bị lùi tới hàng giờ,
và máy chưa có khung PMS thì chỉ báo Hub sau lượt quét, nên quản lý không thấy máy trong khối
"Máy quầy của chi nhánh" và tưởng cài hỏng. Lỗi có từ YC-152, không phải lỗi mới của 1.5.0.

Từ bản này, đổi chu kỳ trên Hub không bao giờ lùi lượt quét đã hẹn: lượt kế tiếp chạy vào giờ sớm
hơn giữa giờ đã hẹn và lúc nhận chu kỳ mới cộng chu kỳ mới; các lượt sau theo chu kỳ mới.

- Máy vừa cài vẫn quét lần đầu sau khoảng 5 phút và hiện trên Hub ngay sau lượt đó. Muốn sớm hơn
  thì bấm **Quét review ngay** trong ô bật lên.
- Hub rút chu kỳ (ví dụ 6 giờ xuống 3 giờ): lượt kế tiếp không muộn hơn 3 giờ kể từ lúc máy nhận.
- Hub nới chu kỳ (ví dụ 3 giờ lên 6 giờ): lượt đã hẹn vẫn chạy đúng giờ, các lượt sau cách 6 giờ.

Tài liệu cài đặt sửa cho khớp lệnh cài và tên extension trên Chrome ("Urban B", sáu bước lệnh cài in ra).

## 1.5.0

Lễ tân và quản lý thấy được trên Hub mọi lỗi máy quầy đang gặp, không chỉ lỗi của lượt quét.

- **Ảnh lỗi đang hiện** (YC-193): mỗi lượt báo Hub mang theo mọi lỗi máy đang hiện cho lễ tân: lỗi
  khung trên PMS, lỗi quét review, lỗi kết nối Hub và máy đang chạy bản cũ. Lỗi bảng khoá, Khoá
  G2J và Chỉ báo được ghi lại lúc gọi hỏng và tự xoá khi gọi ổn lại. Ngoài lượt quét, máy báo Hub
  thêm một lượt khi tập lỗi đang hiện thay đổi.
- **Gửi bù lần mất kết nối Hub** (YC-193): máy ghi lại quãng mất kết nối với Hub (hết phiên, chưa
  đăng nhập, mất mạng) và gửi bù trong lượt báo kế tiếp khi Hub trả lời lại, để Hub biết máy đã
  vắng bao lâu.
- **Tên khách sạn khi hỏi mã kết nối** (YC-192): máy đọc tên khách sạn trên tiêu đề tab PMS ezCloud
  và gửi kèm mã máy khi hỏi Hub mã kết nối, để Hub ghi lại mã chưa ghép kèm tên dễ nhận. Hub bản cũ
  bỏ qua hai thông tin này.

## 1.4.5

**Quét lại kênh sau lỗi đăng nhập** (YC-199). Dòng kênh cần đăng nhập lại trong ô bật lên có hai
nút: **Mở trang đăng nhập** và **Quét lại kênh này** (chỉ quét kênh đó). Khi lễ tân đăng nhập xong
và trang quản lý của kênh tải lên, máy tự quét lại kênh ấy. Máy không quét chồng khi đang có lượt
quét chạy, và nghỉ 3 phút giữa hai lần tự quét cùng một kênh.
