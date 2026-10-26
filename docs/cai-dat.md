# Cài đặt: extension thu review → Hub UrbanB

Mỗi khách sạn cài một bản extension trên máy đang đăng nhập sẵn các extranet
(Booking, Agoda, Trip, Expedia, Traveloka, Go2Joy). Review gửi lên Hub UrbanB theo phiên đăng nhập Hub
của người dùng máy (mục 6).
Extension chỉ đọc: nó không trả lời review, không đổi cài đặt nào trên extranet.

**Từ bản 1.5.2 (YC-228) extension không ghi Google Sheet review nữa**: không gửi review, điểm tổng hợp,
lượt quét, nhật ký lỗi hay tình trạng máy lên Sheet chung. Máy lên bản tự xoá URL Sheet và mã bí mật cũ
khỏi bộ nhớ. Máy chưa chạy lại lệnh cài vẫn chạy bản cũ và vẫn ghi Sheet tới khi lên bản.

## 1. Google Sheet review cũ (tới bản 1.5.1)

Chuỗi mới không cần tạo Sheet. Sheet đã có thì giữ nguyên, đừng xoá: Sheet giữ review do bản tới 1.5.1
ghi, máy chưa lên bản vẫn ghi vào, và menu **Review OTA › Tạo lệnh cài cho khách sạn** vẫn tạo lệnh cài
có mã ([cai-tu-xa.md](cai-tu-xa.md)). `apps-script/Code.gs` giữ nguyên, không còn dùng cho review của
bản 1.5.2. Các bước dưới đây là cách đã dùng để tạo Sheet, giữ lại để tra.

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
4. Trên một máy còn chạy bản tới 1.5.1, bấm **Thử Sheet** để bản mới ghi lần đầu. Máy 1.5.2 không ghi
   Sheet nên không thử được.

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

Máy Windows: dùng cách ở [cai-tu-xa.md](cai-tu-xa.md). Cách tay dưới đây dùng khi thử trên máy khác.

**Từ bản 1.2.0 máy không còn ô nhập tay** (`H-1527` a): không còn ô Mã cài đặt, tên khách sạn, kênh
quét hay mã Booking/Agoda/Expedia trong ô bật lên. Máy tự nhận từ Hub sau khi lễ tân đăng nhập Hub
(mục 6):

- **Tên khách sạn** = tên cơ sở đang dùng trên Hub (tài khoản nhiều cơ sở thì chọn cơ sở trong ô
  bật lên). Tên này đi kèm từng bài gửi lên Hub.
- **Mã Booking / Agoda / Expedia** của từng cơ sở: điền trên Hub khi cần. Để trống thì extension
  tự dò. Booking cần mã khi tài khoản thấy nhiều chỗ nghỉ; Expedia cần mã khi tài khoản quản nhiều
  khách sạn (số `htid` trên thanh địa chỉ), và điền sẵn là cách chắc nhất vì có tài khoản bị
  Expedia đá sang hộp thư (`/supply/inbox`) thay vì trang review.
- **Kênh quét** và chu kỳ: đặt trên Hub (mục 6).

Hub đã biết chi nhánh của máy thì tên và mã chỗ nghỉ theo Hub, thắng cấu hình cũ trong máy (từ 1.5.2
kể cả khi máy còn Sheet cũ; Sheet thu review mà Hub còn gửi cho bản cũ thì máy bỏ qua). Hub chưa biết
chi nhánh (tài khoản nhiều cơ sở chưa chọn cơ sở) thì máy chạy tiếp bằng cấu hình cũ (từ mã cài đặt hay
ô nhập của bản trước). Máy chưa đăng nhập Hub lần nào thì chưa quét, ô bật lên nhắc đăng nhập Hub. Ô bật
lên chỉ cho biết từng mục lấy từ đâu.

1. Chép thư mục `extension/` sang máy.
2. Mở `chrome://extensions`, bật **Chế độ dành cho nhà phát triển**, bấm
   **Tải tiện ích đã giải nén** rồi chọn thư mục `extension/`.
3. Ghim biểu tượng Urban B, bấm vào, bấm **Đăng nhập Hub** và đăng nhập bằng tài khoản lễ tân
   (hoặc mở màn **Cài extension** trên Hub). Khối Cài đặt, mục **Thu review OTA**, cho biết máy đã nhận gì.
4. Bấm **Thử Hub** (tới bản 1.5.1 nút này là **Thử Sheet**). Đường lên Hub thông thì hiện "Hub: ổn".
5. Bấm **Quét review ngay**. Extension mở từng extranet trong một tab nền, đọc review, đóng
   tab, rồi gửi lên Hub. Mỗi kênh mất khoảng nửa phút đến vài phút. Từ bản 1.5.3 tab ấy nằm trong
   nhóm tab xanh **Urban B · đang đọc review** và đầu trang có dải chữ xanh dặn đừng đóng. Lỡ đóng
   giữa chừng thì khung Urban B trên PMS báo một dòng và máy tự đọc lại kênh ấy một lần sau 2 phút.

Sau đó extension tự quét theo số giờ đã đặt (mặc định 6 giờ), miễn là Chrome đang mở.

Máy mới cài hiện trên Hub sau lượt quét đầu: extension tự quét lần đầu khoảng 5 phút sau khi nạp.
Muốn máy hiện sớm hơn thì bấm **Quét review ngay** trong ô bật lên.

**Lên bản mới.** Máy đã cài **không** tự lên bản khi repo có bản mới: ô bật lên chỉ hiện dải vàng
"Có bản mới …" kèm nút **Chép lệnh cập nhật**. Lễ tân (hoặc người quản lý vào máy từ xa) phải chạy
lại lệnh cài, xem [cai-tu-xa.md](cai-tu-xa.md) mục Cập nhật.

## 3. Đọc trạng thái

Ô bật lên có một đèn cho mỗi kênh:

| Đèn | Nghĩa | Làm gì |
|---|---|---|
| Xanh | Lượt gần nhất ổn | Không cần làm gì |
| Cam | Kênh đã đá về trang đăng nhập | Mở extranet đó, đăng nhập lại, bấm Quét review ngay |
| Đỏ | Lỗi khác (đọc dòng chữ dưới tên kênh) | Làm theo câu hướng dẫn trong khung đỏ; vẫn lỗi thì gửi **mã lỗi** |

Mỗi lỗi có một **mã lỗi** dạng `E-7K3QX2` trong khung đỏ dưới tên kênh. Nút **Sao chép**
chép mã kèm tên khách sạn, mã máy, phiên bản và thông điệp lỗi; dán đoạn đó gửi người
quản lý thay cho ảnh chụp. Từ bản 1.5.2 lỗi không lên tab `Nhật ký lỗi` của Sheet nữa, nên đoạn
chép này là chỗ đọc chi tiết lỗi. Danh mục loại lỗi và cách xử lý: [ma-loi.md](ma-loi.md).

Biểu tượng có dấu `!` đỏ khi có ít nhất một kênh đang bật không xanh hoặc gửi Hub hỏng. Dưới cùng
ô bật lên là **mã máy** (8 ký tự) và phiên bản.

Người quản lý không cần tới tận máy: từ bản 1.5.0 mỗi lượt báo Hub mang theo các lỗi máy đang hiện
(xem [CHANGELOG.md](../CHANGELOG.md)). Các tab dưới đây của Sheet chỉ còn nhận từ máy chạy bản tới 1.5.1:

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

## 4. Dữ liệu trong Sheet (tới bản 1.5.1)

Từ bản 1.5.2 các tab dưới đây không nhận thêm dữ liệu từ máy đã lên bản.

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

Từ bản 1.5.2 Hub là đích duy nhất của review (tới 1.5.1 review lên Hub song song với Sheet).

**Từ bản 1.1.0 review lên Hub theo phiên đăng nhập Hub của người dùng máy**, không còn URL Hub
hay Token Hub (quyết định `H-1233` a). Bài đứng tên người đang đăng nhập, Hub kiểm quyền
*thêm review* theo cơ sở người ấy được gán.

**Bật cho một máy:** bấm biểu tượng Urban B, bấm **Đăng nhập Hub** và đăng nhập bằng tài khoản
lễ tân. Từ bản 1.2.0 máy dùng Hub nào là theo trang **Cài extension** (`/extension`) mở gần nhất
trên `hub.urbanb.vn` hay `urbanb.xyz` (để thử); ô bật lên chỉ hiện "Hub đang dùng", không còn ô chọn. Bấm **Thử Hub**: dòng kết quả "Hub: ổn" là đường lên Hub thông (lệnh
thử không ghi gì lên Hub). Chưa đăng nhập hay hết phiên thì review chưa lên đâu cả, ô bật lên báo
"Review chưa lên Hub · cần đăng nhập Hub"; lượt quét sau khi đăng nhập gửi lại toàn bộ bài.

**Cấu hình đặt trên Hub** (`H-1348` a): Quản trị hệ thống đặt ở màn Kết nối › tab Mã kết nối Booking OTA ›
khối Extension máy quầy,
một cấu hình cho cả chuỗi:

- **Kênh quét** và **chu kỳ tự quét**. Máy hỏi Hub trước mỗi lượt quét và mỗi 30 phút. Có cấu
  hình trên Hub thì dưới nút Quét có dòng "tự quét mỗi N giờ (theo cấu hình trên Hub)". Máy không
  còn ô nhập chu kỳ hay ô Kênh quét. Từ bản 1.5.1, đổi chu kỳ trên Hub không lùi lượt quét đã hẹn:
  lượt kế tiếp chạy vào giờ sớm hơn giữa giờ đã hẹn và lúc nhận chu kỳ mới cộng chu kỳ mới.
- **Mã Booking/Agoda/Expedia của từng cơ sở** (`H-1527` a, xem mục 2). Khối Sheet review trên Hub
  chỉ còn dùng cho máy chạy bản tới 1.5.1.
- **Thời gian tự ẩn thông báo nổi** trên PMS.
- Hub chưa có cấu hình (hoặc máy chưa đăng nhập Hub lần nào): kênh theo cấu hình cũ của máy (mã
  cài đặt hay ô Kênh quét của bản trước), chu kỳ 6 giờ.

**Tài khoản có nhiều cơ sở** (`H-1351` c): ô bật lên hiện ô chọn **cơ sở của máy quầy**. Token
Go2Joy gửi về Apps Script của cơ sở đã chọn; chưa chọn thì token Go2Joy chưa gửi và trang Go2Joy
nhắc chọn. Tài khoản một cơ sở thì không phải chọn.

**Extension gửi gì:**

- Mỗi lượt quét, mỗi kênh: toàn bộ bài vừa đọc, chia lô tối đa 200 bài
  (Hub nhận tối đa 500 bài và 2 MiB mỗi lần). Hub chống trùng theo kênh và mã review, và
  dùng cột "Mã nội dung" để biết bài đổi, nên gửi lại bài cũ không tạo bài mới.
- Chỉ các trường: kênh, mã review, mã khách sạn trên kênh, tên khách sạn, mã đặt phòng,
  ngày review, điểm và thang, tiêu đề, điểm khen, điểm chê, nhận xét, phản hồi, ngày phản
  hồi, mã nội dung. Không gửi JSON gốc. Tên khách đã bị gỡ
  từ trước.
- Không có header `Authorization`: request mang cookie phiên Hub của trình duyệt. Hub nhận
  biết đường phiên chính bằng việc vắng header này.

**Đọc kết quả:** dưới mỗi kênh trong ô bật lên có dòng
"Hub: 3 mới · 1 đổi · 662 chờ ghép". *Chờ ghép* là bài của mã khách sạn mà Admin Hub
chưa ghép với cơ sở: bài nằm ở bảng chờ của Hub và tự vào khi Admin ghép ở
`/admin/review-hotel-links`. *Mã ngoài phạm vi* là mã khách sạn đã ghép vào một cơ sở mà
tài khoản đang đăng nhập không được gán: Hub không nhận bài của mã đó (lỗi `HUB-SCOPE`), các mã
khác vẫn nhận.

**Khi Hub hỏng:** kênh vẫn xanh vì quét được, nhưng review chưa lên Hub. Lỗi Hub có loại `HUB-…`
(xem [ma-loi.md](ma-loi.md)), hiện khung đỏ dưới kênh và bật dấu `!` trên biểu tượng.
Extension không xếp hàng gửi lại lên Hub: lượt quét sau gửi lại toàn bộ bài.
