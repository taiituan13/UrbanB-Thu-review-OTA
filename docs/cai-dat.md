# Cài đặt: extension thu review → Google Sheet

Mỗi khách sạn cài một bản extension trên máy đang đăng nhập sẵn các extranet
(Booking, Agoda, Trip, Expedia, Traveloka, Go2Joy). Mọi bản cài cùng ghi vào **một** Google Sheet chung.
Extension chỉ đọc: nó không trả lời review, không đổi cài đặt nào trên extranet.

## 1. Tạo Google Sheet và điểm nhận (làm một lần, ở máy quản lý)

1. Tạo một Google Sheet mới, ví dụ đặt tên "Review OTA — chuỗi".
2. Mở **Tiện ích mở rộng › Apps Script**. Xoá nội dung có sẵn, dán toàn bộ
   `apps-script/Code.gs`, rồi bấm Lưu.
3. Chọn hàm `setup` ở thanh trên, bấm **Chạy**. Lần đầu Google sẽ hỏi quyền truy cập
   Sheet; chấp nhận.
   - Hàm tạo các tab: `Thống kê`, `Review`, `Điểm hạng mục`, `Lượt quét`, `Điểm tổng hợp`,
     `Máy cài`, `Nhật ký lỗi`.
   - Mở **Nhật ký thực thi** để chép dòng *"Mã bí mật (dán vào extension): …"*.
4. Bấm **Triển khai › Tùy chọn triển khai mới › Ứng dụng web**:
   - Thực thi dưới tên: **Tôi**
   - Người có quyền truy cập: **Bất kỳ ai**
5. Chép **URL ứng dụng web** (kết thúc bằng `/exec`).

"Bất kỳ ai" chỉ có nghĩa là URL nhận được yêu cầu. Yêu cầu không mang đúng mã bí mật
sẽ bị từ chối, và Sheet vẫn chỉ người được chia sẻ mới xem được.

Sửa `Code.gs` về sau thì phải **Quản lý triển khai › Chỉnh sửa › Phiên bản mới**.
Không làm bước này thì URL vẫn chạy mã cũ.

**Nâng cấp một Sheet đã có:**

1. Dán `Code.gs` mới, bấm **Lưu**.
2. **Triển khai › Quản lý triển khai**, chọn đúng bản triển khai mà các máy đang dùng
   (URL `/exec` trong extension), bấm biểu tượng bút chì, ở ô *Phiên bản* chọn
   **Phiên bản mới**, bấm **Triển khai**. URL giữ nguyên.
3. **Không chạy lại `setup`.** Lần ghi đầu tiên của bản mới tự tạo tab còn thiếu và tự
   xếp lại cột. Mã bí mật giữ nguyên, không phải dán lại vào extension.
4. Trên một máy, bấm **Thử Sheet** để bản mới ghi lần đầu.

Vì sao không chạy `setup` khi nâng cấp: `setup` chạy mã mới ngay trong trình soạn, trong
khi URL `/exec` vẫn phục vụ mã cũ cho tới lúc triển khai Phiên bản mới. Nếu `setup` xếp
lại một tab trước, mã cũ vẫn ghi dòng theo thứ tự cột cũ vào tab đã đổi ⇒ dòng đó lệch
cột. Đã xảy ra ngày 08/10/2026 ở tab `Nhật ký lỗi`.

Bản mới thêm hoặc dời cột thì tab cũ được xếp lại **theo tên cột** ở lần ghi đầu tiên:
dữ liệu cũ đi theo tên cột của nó, cột mới để trống. Cột tự thêm vào được giữ và dời ra
cuối. Vì việc xếp lại dựa vào tên, **đừng đổi tên dòng tiêu đề** của các tab dữ liệu.

Cột *Mất liên lạc* của tab `Máy cài` là công thức. Sheet đặt vùng Việt Nam dùng dấu `;`
giữa các đối số, vùng Mỹ dùng `,`. `Code.gs` ghi thử bằng `,`, thấy `#ERROR!` thì ghi lại
bằng `;` và nhớ lựa chọn trong *Thuộc tính tập lệnh* (`FORMULA_SEP`). Đổi vùng của Sheet
cũng không cần làm gì: dấu đã nhớ hỏng thì lượt ghi kế tiếp tự thử dấu còn lại.

## 2. Cài extension trên máy từng khách sạn

Máy Windows: dùng cách ở [cai-tu-xa.md](cai-tu-xa.md). Cách đó cài bằng một lệnh và cập nhật
bằng cách chạy lại lệnh. Cách tay dưới đây dùng khi thử trên máy khác, và để hiểu các ô.

1. Chép thư mục `extension/` sang máy.
2. Mở `chrome://extensions`, bật **Chế độ dành cho nhà phát triển**, bấm
   **Tải tiện ích đã giải nén** rồi chọn thư mục `extension/`.
3. Ghim biểu tượng "Thu review OTA", bấm vào rồi điền:
   - **Tên khách sạn**: ghi vào cột "Khách sạn", và là tên của máy trong tab `Máy cài`.
     Mỗi máy một tên, viết thống nhất.
   - **URL Web App** và **Mã bí mật**: lấy từ bước 1.
   - **URL Hub** và **Token Hub**: chỉ điền khi khách sạn gửi review lên Hub UrbanB
     (mục 6). Để trống URL Hub thì máy chỉ gửi Sheet.
   - **Kênh quét**: bỏ chọn kênh mà khách sạn không có. Expedia, Traveloka và Go2Joy mặc
     định **tắt**; khách sạn có các kênh này thì tick vào.
   - **Mã Booking**: chỉ cần điền khi tài khoản Booking thấy nhiều chỗ nghỉ.
   - **Mã Agoda**: để trống thì extension tự dò.
   - **Mã Expedia**: để trống thì extension tự dò khi tài khoản chỉ có một khách sạn; tài
     khoản quản nhiều khách sạn thì điền mã (số `htid` trên thanh địa chỉ). Điền sẵn cũng là
     cách chắc nhất: có tài khoản bị Expedia đá sang hộp thư (`/supply/inbox`) thay vì trang
     review, và trang đó không phải lúc nào cũng mang mã.
4. Bấm **Thử Sheet**. Đúng thì hiện tên Sheet; máy có điền URL Hub thì dòng đó có thêm
   "Hub: ổn".
5. Bấm **Quét ngay**. Extension mở từng extranet trong một tab nền, đọc review, đóng
   tab, rồi gửi lên Sheet. Mỗi kênh mất khoảng nửa phút đến vài phút.

Sau đó extension tự quét theo số giờ đã đặt (mặc định 6 giờ), miễn là Chrome đang mở.

## 3. Đọc trạng thái

Ô bật lên có một đèn cho mỗi kênh:

| Đèn | Nghĩa | Làm gì |
|---|---|---|
| Xanh | Lượt gần nhất ổn | Không cần làm gì |
| Cam | Kênh đã đá về trang đăng nhập | Mở extranet đó, đăng nhập lại, bấm Quét ngay |
| Đỏ | Lỗi khác (đọc dòng chữ dưới tên kênh) | Làm theo câu hướng dẫn trong khung đỏ; vẫn lỗi thì gửi **mã lỗi** |

Mỗi lỗi có một **mã lỗi** dạng `E-7K3QX2` trong khung đỏ dưới tên kênh. Nút **Sao chép**
chép mã kèm tên khách sạn, mã máy, phiên bản và thông điệp lỗi; dán đoạn đó gửi người
quản lý thay cho ảnh chụp. Người quản lý tìm mã bằng Ctrl+F trong tab `Nhật ký lỗi`.
Danh mục loại lỗi và cách xử lý: [ma-loi.md](ma-loi.md).

Biểu tượng có dấu `!` đỏ khi có ít nhất một kênh không xanh. Dưới cùng ô bật lên là
**mã máy** (8 ký tự) và phiên bản, để đối chiếu với tab `Máy cài`.

Người quản lý không cần tới tận máy:

- **Máy cài**: mỗi tên khách sạn một dòng — trạng thái từng kênh, lần cuối liên lạc,
  lỗi gần nhất, phiên bản, kênh đang bật. Cột **Mất liên lạc** tự hiện khi máy im quá
  2 × chu kỳ quét (Chrome tắt, máy tắt, hoặc extension bị gỡ). Cột **Cảnh báo** báo
  khi hai máy khác nhau cùng khai một tên, hoặc một máy đã đổi tên sang tên khác.
  Các cột giờ (lần cuối, lần đầu liên lạc, lúc lỗi, hạn liên lạc kế tiếp) hiện theo múi giờ
  của tệp Sheet: đặt ở **Tệp › Cài đặt › Múi giờ** là `(GMT+07:00) Bangkok, Hà Nội`. Các tab
  chỉ thêm dòng (`Lượt quét`, `Nhật ký lỗi`) vẫn ghi mốc chữ theo giờ UTC.
- **Nhật ký lỗi**: mỗi lỗi một dòng — mã lỗi, loại lỗi, kênh, giai đoạn (mở tab · đăng nhập · quét ·
  chuẩn hoá · gửi Hub · gửi Sheet), thông điệp, trang lúc lỗi, chi tiết kỹ thuật. Lọc theo cột
  *Khách sạn* để xem riêng một máy. Giữ 5.000 dòng mới nhất.
- **Lượt quét**: mọi lượt của mọi khách sạn, kể cả lượt lỗi.

## 4. Dữ liệu trong Sheet

- **Thống kê** (tab đầu): tự tính lại sau mỗi lượt quét; bấm tay qua menu
  **Review OTA › Cập nhật thống kê**. Gồm ba bảng: theo khách sạn (có dòng toàn
  chuỗi), theo khách sạn × kênh (có lượt quét gần nhất), và điểm hạng mục 90 ngày.
  Muốn đổi cửa sổ 30/90 ngày thì sửa hằng `STATS` ở đầu phần thống kê trong `Code.gs`.
- **Review**: mỗi bài một dòng. Khoá là `kênh|mã review`. Quét lại bài đã có thì
  không thêm dòng mới; nếu nội dung đổi (khách sửa bài, khách sạn trả lời) thì dòng
  được cập nhật, và cột "Lần cuối thấy" luôn được dời.
- **Điểm hạng mục**: điểm từng hạng mục của từng bài, giữ **tên gốc** của kênh.
  Agoda, Traveloka và Expedia không có điểm hạng mục theo bài. Go2Joy có ba hạng mục
  theo bài: Sạch sẽ, Tiện ích, Dịch vụ.
- **Điểm tổng hợp**: điểm cấp khách sạn mà kênh tự tính — Agoda, Traveloka và Go2Joy có
  từng hạng mục, Expedia chỉ có điểm tổng.
  Mỗi lượt quét thêm một bộ dòng, nên xem được điểm đi lên hay đi xuống.
- **Lượt quét**: nhật ký.
- **Máy cài**, **Nhật ký lỗi**: xem mục 3.

Nhật ký lỗi không chứa phiên đăng nhập: URL bị cắt bỏ mọi thứ sau dấu `?` (nơi Booking
để mã phiên `ses`), và extension không gửi cookie hay token.

Tên khách bị gỡ trước khi gửi. Mã đặt phòng thì vẫn giữ, vì đó là thứ nối review về
lượt lưu trú.

Thang điểm: Booking, Agoda, Trip, Expedia, Traveloka dùng thang 10; Go2Joy dùng thang 5.
Các tab Review, Điểm hạng mục, Điểm tổng hợp giữ điểm gốc kèm cột "Thang"; tab Thống kê
tự quy mọi điểm về thang 10.

## 5. Giới hạn đã biết

- Google đôi khi trả trang lỗi 404 khi Sheet trả lời (đo ngày 08/10/2026: khoảng 1/10
  lượt), dù dữ liệu đã ghi xong. Extension tự gửi lại tối đa 3 lần; Sheet nhận ra lượt
  gửi lại và không ghi lần hai. Cả 3 lần đều hỏng thì lỗi nằm chờ trong máy (tối đa 50
  dòng) và được gửi kèm lượt sau.
- Phiên Booking hết hạn sau khoảng 2 giờ không dùng. Nếu máy chỉ mở Chrome mà không
  ai đụng tới extranet, kênh Booking sẽ thường xuyên báo cam.
- Trip mới đọc nguồn Trip.com (`channelSource = 1`); bài từ Qunar/Ly.com chưa thu.
- Expedia gom bài của mọi thương hiệu trong nhóm (Expedia, Hotels.com, Travelocity…);
  thương hiệu mới nằm trong cột dữ liệu gốc, chưa tách thành cột riêng.
- Expedia, Traveloka và Go2Joy: extension dùng lại request mà chính trang gửi, nên trang review
  phải tải được bình thường. Dạng phản hồi của khách sạn trên Expedia và trang đăng nhập
  của Traveloka **chưa đo** (khách sạn đo thử chưa có phản hồi nào, và phiên chưa hết hạn);
  lần đầu gặp có thể báo đỏ thay vì cam.
- Go2Joy: giờ review được hiểu là giờ Việt Nam. Extension nhận ra phiên hết hạn khi trang
  bị đẩy khỏi `/review-detail`. Tài khoản quản nhiều khách sạn thì quét khách sạn đang
  được chọn trên trang. Phản hồi của khách sạn đã đo trên Secret Garden Bình Thạnh (47/662
  bài có phản hồi, 08/10/2026).
- Endpoint là API nội bộ của extranet, đo ngày 07–08/10/2026. Kênh đổi giao diện thì
  extension sẽ báo đỏ, và phải sửa `extension/scanners.js`.

## 6. Gửi lên Hub UrbanB

Từ bản 0.8.0, extension gửi được review lên Hub UrbanB, song song với Sheet. Sheet vẫn nhận
đủ như cũ; Hub là đích thứ hai.

**Bật cho một máy:** trong khối Cài đặt, điền **URL Hub** và **Token Hub**, rồi bấm
**Thử Sheet**. Dòng kết quả có "Hub: ổn" là đường lên Hub thông (lệnh thử không ghi gì
lên Hub).

- URL Hub chỉ nhận `https://hub.urbanb.vn` (production) hoặc `https://urbanb.xyz` (bãi
  thử). Gửi tới tên miền khác thì Chrome chặn, vì manifest chỉ xin quyền hai tên miền này.
- Token Hub là chuỗi `REVIEWS_INGEST_TOKEN` trong tệp `.env` của máy chủ Hub. Người quản
  lý chép từ đó và gửi riêng; không dán token vào nhóm chung.

**Extension gửi gì:**

- Mỗi lượt quét, mỗi kênh: toàn bộ bài vừa đọc, chia lô tối đa 200 bài
  (Hub nhận tối đa 500 bài và 2 MiB mỗi lần). Hub chống trùng theo kênh và mã review, và
  dùng cột "Mã nội dung" để biết bài đổi, nên gửi lại bài cũ không tạo bài mới.
- Chỉ các trường: kênh, mã review, mã khách sạn trên kênh, tên khách sạn, mã đặt phòng,
  ngày review, điểm và thang, tiêu đề, điểm khen, điểm chê, nhận xét, phản hồi, ngày phản
  hồi, mã nội dung. Không gửi JSON gốc, không gửi mã bí mật của Sheet. Tên khách đã bị gỡ
  từ trước.
- Token chỉ đi trong header `Authorization`, không nằm trong thân request.

**Đọc kết quả:** dưới mỗi kênh trong ô bật lên có dòng
"Hub: 3 mới · 1 đổi · 662 chưa ghép". *Chưa ghép* là bài của mã khách sạn mà Admin Hub
chưa ghép với chi nhánh: bài nằm ở bảng chờ của Hub và tự vào khi Admin ghép ở
`/admin/review-hotel-links`.

**Khi Hub hỏng:** lượt gửi Sheet vẫn chạy. Lỗi Hub có loại `HUB-…`
(xem [ma-loi.md](ma-loi.md)), hiện khung đỏ dưới kênh và bật dấu `!` trên biểu tượng.
Extension không xếp hàng gửi lại lên Hub: lượt quét sau gửi lại toàn bộ bài.
