# Ghi chú phát hành

Mỗi bản một mục, bản mới nhất ở trên. Viết cho người vận hành: máy quầy thay đổi gì, lễ tân và
quản lý thấy gì khác. Máy đã cài không tự lên bản: khi có bản mới, ô bật lên hiện dải vàng
"Có bản mới …" và phải có người chạy lại lệnh cài (xem [docs/cai-tu-xa.md](docs/cai-tu-xa.md) mục
Cập nhật).

## 1.5.5

**Lễ tân bấm Quét trên trang Giao ca quầy thì máy tự lấy số ezCloud** (YC-246, đổi 27/10/2026). Lễ tân không phải
bấm Bàn giao trên PMS nữa. Cùng lúc quét review, extension đọc ca ezCloud đang mở trong tab PMS của máy (đúng lệnh
trang Bàn giao ca của PMS gọi) và gửi Hub số Đầu ca, Tổng thu, Tổng chi. Hub tính ra số "Bàn giao cho ca sau" cho ô
"Số sổ ezCloud".

- Máy chưa mở tab PMS nào thì extension tự mở một tab PMS nền, đọc xong đóng. Tab này không vào nhóm tab quét review.
- Chưa đăng nhập PMS, ca đã kết hay mất mạng thì không gửi gì; ô trên Hub ghi "Chưa lấy được số ezCloud" và lễ tân
  vẫn Chốt được.
- Kết quả quét chỉ về trang Hub sau khi số ezCloud đã gửi xong, chậm nhất 30 giây.
- Extension chỉ đọc: không đổi khách sạn mặc định, không gọi lệnh ghi nào tới ezCloud. Tin gửi Hub chỉ gồm số và
  mã, không token, không tên người. Hợp đồng: [docs/hop-dong-ban-giao-ca-pms.md](docs/hop-dong-ban-giao-ca-pms.md).

**Lượt bấm Bàn giao trên PMS** (H-2034 b, 26/10/2026, phần dưới đây) vẫn được gửi Hub như trước; trang Giao ca
quầy không còn đọc số này. Lễ tân bấm
**Bàn giao** trên trang Bàn giao ca của PMS ezCloud thì extension gửi Hub con số lễ tân vừa chốt ở dòng 7
"Bàn giao cho ca sau", kèm dòng 6 "Thực tế trong két" và dòng 8 "Bàn giao cho quản lý". Ô "Số sổ ezCloud"
trên trang Giao ca quầy của Hub đọc số này. Trang Hub do UrbanB dựng riêng; bản này chỉ là phần của extension.

- Chỉ gửi khi ezCloud báo bàn giao xong. Bấm Bàn giao mà PMS báo lỗi thì không gửi gì.
- Mỗi ca ezCloud gửi một lần. Lễ tân bấm hai lần hay PMS gửi lại thì Hub vẫn chỉ nhận một lượt.
- Hub không trả lời được (mất mạng, hết phiên đăng nhập Hub) thì máy giữ lại và gửi lại sau, tối đa 3 ngày.
- Tin gửi Hub chỉ gồm số và mã: mã khách sạn, mã và số ca ezCloud, ba con số, giờ bàn giao, phiên bản
  extension. Không có token PMS, tên lễ tân hay email. Hợp đồng: [docs/hop-dong-ban-giao-ca-pms.md](docs/hop-dong-ban-giao-ca-pms.md).
- Hub chưa lên bản có trang nhận số thì máy giữ lượt ấy trong hàng chờ, khung quầy không báo lỗi gì.
- Extension không bấm gì và không gửi gì tới ezCloud; nó chỉ đọc lượt bấm của lễ tân.

**Nhóm tab "Urban B · đang đọc review" biến mất khi quét xong** (YC-249). Trước đây nhóm có thể còn lại
trên thanh tab khi lượt quét bị cắt ngang (Chrome dừng tiến trình nền giữa lượt, hoặc tắt Chrome rồi mở
lại), khi một bước báo lỗi làm máy mất dấu tab, hoặc khi trang extranet tự mở thêm một tab trong nhóm.

- Máy dọn nhóm ở cuối mỗi lượt quét (đạt hay hỏng), ở đầu lượt sau, và mỗi khi tiến trình nền chạy lại.
- Tab máy tự mở, kể cả tab do trang extranet mở ra từ tab ấy, thì đóng.
- Tab lễ tân tự kéo vào nhóm thì chỉ được tháo ra khỏi nhóm, tab vẫn mở.

## 1.5.4

**Trang Giao ca quầy trên Hub quét được review ngay trên máy quầy** (YC-239, H-1996 a, H-1976 c).
Trước khi giao ca, lễ tân bấm Quét trên trang Giao ca quầy của Hub; Hub gửi lệnh quét qua extension
của chính máy quầy và nhận kết quả ngay trên trang. Trang Hub do UrbanB dựng riêng; bản này chỉ là
phần của extension.

- Extension nhận lệnh quét (`ext:scan`) từ trang Hub, chỉ trên `hub.urbanb.vn` và `urbanb.xyz`. Lượt
  quét đi qua mọi kênh máy đang quét; trang thấy từng kênh đang quét, đạt, lỗi hay cần đăng nhập lại,
  kèm mã lỗi như ô bật lên và khung trên PMS.
- Đang có lượt quét mọi kênh (hẹn giờ, lễ tân bấm Quét review ngay) thì trang gắn vào lượt ấy, máy
  không quét hai lượt chồng nhau. Đang có lượt quét một kênh thì chờ lượt ấy xong rồi mới quét.
- Tab quét bị đóng giữa chừng: trang Giao ca báo ngay kênh ấy lỗi `TAB`, không chờ. Máy vẫn tự đọc lại
  kênh ấy sau 2 phút như 1.5.3.
- Đóng hay tải lại trang Giao ca giữa chừng: lượt quét vẫn chạy hết và vẫn gửi Hub như lượt thường.
- Tin gửi trang Hub không có mã bí mật, URL Sheet, email hay mã kết nối OTA. Hợp đồng đầy đủ cho trang
  Hub: [docs/hop-dong-hub-bridge.md](docs/hop-dong-hub-bridge.md).
- Hợp đồng gửi Hub không đổi. Lượt quét giao ca gửi lên Hub như lượt người bấm.
- Mọi máy quầy phải chạy lại lệnh cài để lên 1.5.4 thì trang Giao ca mới quét được; máy còn bản cũ
  không trả lời lệnh quét.

**Video hướng dẫn cập nhật ngay trong ô bật lên.** Dải vàng "Có bản mới …" và nhóm Cập nhật trong Cài
đặt có thêm link **Xem video hướng dẫn cập nhật**. Bấm vào là video mở ở tab mới, người ở quầy xem rồi
làm theo, không phải hỏi ai.

**Quầy biết khi phiên đăng nhập PMS gửi Google Sheet bị từ chối hoặc đã chết** (YC-240, H-1980 a). Tới
1.5.3 lời "bị từ chối" chỉ hiện 10 giây và chỉ lần đầu; token đã lưu rồi mới chết thì máy không biết gì
(ca thật: Linh Đan Phú Nhuận, ngày 26/10/2026 có 7 booking Go2Joy không vào được ezCloud mà quầy không
hay).

- Google Sheet không nhận phiên đăng nhập PMS (hoặc Go2Joy) máy vừa gửi: khung Urban B trên PMS (đầu
  mọi tab), nút gập và ô bật lên giữ một dòng đỏ nói giờ gửi và việc phải làm (mở lại hoặc đăng nhập lại
  PMS), tới khi máy gửi được phiên mới. Lời báo 10 giây lần đầu vẫn như cũ.
- Phiên đăng nhập đang chờ Quản lý cơ sở xác nhận ở bước 2 trên Google Sheet: dòng vàng, giữ tới khi
  được xác nhận.
- Google Sheet báo ezCloud đã từ chối phiên đăng nhập đã lưu: dòng đỏ nói giờ bị từ chối, số booking
  đang chờ vào ezCloud, và bảo mở lại hoặc đăng nhập lại PMS. Sheet báo chưa có phiên đăng nhập: bảo báo
  Quản trị hệ thống dán mã kết nối lên Hub. Lễ tân đăng nhập lại, máy gửi phiên mới được lưu thì dòng
  tự hết ở lượt đọc kế.
- Phần Sheet báo sức khoẻ phiên đăng nhập cần bản Apps Script mới của Google Sheet khách sạn (làn
  Apps Script của YC-240). Sheet còn bản cũ thì máy không hiện gì thêm, không báo lỗi.
- Sheet báo ezCloud đã từ chối phiên đăng nhập đã lưu: máy báo Hub bằng mã lỗi sẵn có "Phiên PMS máy đẩy
  lên bị Booking OTA từ chối", kèm số đơn đang chờ, để Quản trị thấy trên màn Máy quầy. Không có mã mới,
  hợp đồng gửi Hub không đổi.
- Chữ hiện không có token, khoá, URL Web App hay email.

## 1.5.3

**Tab máy tự mở để đọc review: lễ tân nhận ra được, lỡ đóng thì máy tự đọc lại** (YC-238, H-1972 a,
H-1973 a). Tới 1.5.2 tab nền không có nhãn gì, lễ tân không biết là của máy nên đóng giữa chừng, kênh
báo đỏ `TAB` (ca thật: The Passion Airport, `BKG-TAB` lúc 10:17 ngày 26/10/2026).

- Tab quét nằm trong nhóm tab màu xanh tên **Urban B · đang đọc review** trên thanh tab. Các kênh của
  cùng một lượt quét dùng chung một nhóm. Tab vẫn mở nền, không giật tiêu điểm của lễ tân.
- Đầu trang đang đọc có dải chữ xanh: "Urban B đang đọc review trên trang này. Tab sẽ tự đóng khi đọc
  xong, xin đừng đóng tab." Dải chữ không bắt chuột, không che nút của trang.
- Lỡ đóng tab giữa chừng: kênh chưa báo đỏ. Khung Urban B trên PMS, khối Thu review, báo một dòng "Bạn
  vừa đóng tab … lúc máy đang đọc review. Máy sẽ đọc lại lúc hh:mm." (khung đang gập thì dòng ấy hiện ở
  dải nhắc dưới trang). Sau 2 phút máy tự đọc lại riêng kênh ấy, một lần. Đạt thì kênh xanh và dòng
  tự hết. Lần đọc lại cũng hỏng thì báo lỗi như trước: đỏ, mã `TAB` hoặc mã thật của lần ấy.
- Lời giải thích của mã `TAB` nay nói máy đã tự đọc lại mà tab vẫn bị đóng, và chỉ chỗ nhóm tab xanh.
- Extension xin thêm quyền `tabGroups`. Nhóm tab hay dải chữ không làm được (cửa sổ đặc biệt, trang
  chặn) thì máy vẫn đọc review bình thường.
- Hợp đồng gửi Hub không đổi. Lượt đọc lại gửi lên Hub như lượt hẹn giờ; việc chờ đọc lại không gửi Hub.

## 1.5.2

**Review chỉ lên Hub, không ghi Google Sheet review nữa** (YC-228). Tới 1.5.1, Sheet hỏng (sai URL,
sai mã bí mật, Google trả trang lỗi) làm kênh quét được vẫn báo đỏ, huy hiệu hiện "!" mãi và Hub đếm
lỗi `REVIEW_SHEET_FAILED`, dù review đã lên Hub đủ.

- Máy không gửi gì lên Sheet review: không review, điểm tổng hợp, lượt quét, nhật ký lỗi hay tình trạng
  máy. Kênh quét được là xanh; kênh chỉ đỏ hay cam vì chính lượt quét, dòng Hub dưới kênh báo việc gửi Hub.
- Lên bản, máy tự xoá URL Sheet, mã bí mật, hàng đợi nhật ký lỗi chờ gửi Sheet và dấu lỗi gửi Sheet
  khỏi bộ nhớ. Huy hiệu hết "!" vì Sheet; Hub không còn nhận `REVIEW_SHEET_FAILED` từ máy này.
- Sheet thu review mà Hub còn gửi (khối Sheet review, giữ cho máy bản cũ) bị bỏ qua. Tên khách sạn và
  mã chỗ nghỉ theo chi nhánh trên Hub, kể cả máy còn Sheet cũ.
- Nút **Thử Sheet** đổi thành **Thử Hub**. Khung "Lỗi gửi Sheet" và các dòng "Chưa ghi Sheet" bỏ.
- Mã cài đặt `URB1.` cũ (có URL Web App và mã bí mật) vẫn áp được; phần Sheet bỏ qua.
- Máy chưa đăng nhập Hub lần nào thì chưa quét (tới 1.5.1 máy có Sheet cũ vẫn quét và chỉ ghi Sheet).
- Lượt báo Hub (`ext:status`): `review.fromHub` nay nghĩa là tên khách sạn lấy từ Hub (tới 1.5.1:
  Sheet lấy từ Hub).
- `apps-script/Code.gs` giữ nguyên, không còn dùng cho review của bản này. Sheet cũ giữ dữ liệu cũ,
  vẫn nhận từ máy chưa lên bản, và menu Tạo lệnh cài vẫn dùng được.

**Lệnh cài Windows** (YC-223), có hiệu lực ngay cả với máy đang chạy bản cũ vì lệnh tải từ `main`:

- Giải nén vào thư mục tạm dưới `C:\UrbanB\tmp`, không qua `TEMP` của Windows (PowerShell 5.1 hỏng
  với đường dẫn ngắn kiểu `ANHRUA~1` khi tên người dùng có dấu). Thư mục tạm được dọn cả khi lỗi.
- Bật UTF-8 cho cửa sổ PowerShell trước dòng chữ đầu tiên, để chữ tiếng Việt không vỡ.

Mọi máy phải chạy lại lệnh cài để lên 1.5.2 (xem [docs/cai-tu-xa.md](docs/cai-tu-xa.md) mục Cập nhật).

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
