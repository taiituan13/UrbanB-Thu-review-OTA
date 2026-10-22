# Thu review OTA (urbanb-reviews) — hướng dẫn cho AI

Chrome extension (Manifest V3, JS thuần, không build) đọc review khách sạn từ extranet Booking,
Agoda, Trip, Expedia, Traveloka, Go2Joy bằng phiên đăng nhập sẵn có trên máy KS. Review được gửi
lên một Google Sheet chung (`apps-script/Code.gs`) và tuỳ chọn lên UrbanB Hub. Mỗi KS cài một bản.
Người dùng đọc tiếng Việt: trả lời, giao diện, thông báo và tài liệu đều viết tiếng Việt.

Tài liệu cho người: `README.md`, `docs/`. Các công cụ UrbanB khác: `../UrbanB-tools.md`.

## Luật chung với UrbanB (gộp 22/10/2026)

Bản đầy đủ và lý do của từng luật nằm ở `../UrbanB/CLAUDE.md`. Ở đây là phần áp cho mọi repo
đi kèm. Mục "Không được làm khi chưa có lệnh rõ" bên dưới là danh sách riêng của repo này.

### Bàn trước, triển khai sau

- Người dùng nêu vấn đề thì trước hết nói rõ: phương án (nhiều lối thì liệt kê), phạm vi (tệp,
  lệnh, máy, dữ liệu sẽ đụng), chỗ còn phải chốt, mức ưu tiên và nỗ lực (hai mục dưới).
- Yêu cầu đã rõ và mọi câu hỏi đã có lời (kể cả "theo gợi ý") thì chính lời chốt là tín hiệu:
  báo một dòng "sẽ làm gì" rồi làm, không hỏi lại "làm đi chưa".
- Còn lối chưa chọn hoặc còn câu hỏi mở thì chờ người dùng nói "làm đi". Im lặng không phải
  cho phép.
- Đọc, tìm kiếm, chạy test không gửi gì ra ngoài: làm ngay. Sửa, tạo, xoá tệp, commit: theo
  hai dòng trên.

### Mức ưu tiên: xếp theo tác động lên người dùng

- **Đỏ**: sai hoặc mất dữ liệu, job chết, người dùng (lễ tân, quản lý, kế toán…) đang bị chặn việc.
- **Vàng**: làm được nhưng hiểu sai nghĩa, chậm, phải đi đường vòng.
- **Trắng**: tiện hơn, đẹp hơn, dọn nợ kỹ thuật.
- Mỗi mức phải nói được vai nào, ở đâu, bị gì hoặc được gì. Chưa đủ căn cứ thì ghi
  "chưa xếp", không đoán thay người dùng.

### Nỗ lực: ước theo AI, không theo giờ công người

Không ghi "mất 2 ngày", "nửa buổi". Ước theo năm trục thật sự tốn khi agent làm:

- **Bề rộng**: bao nhiêu tệp, bao nhiêu repo; có đụng hợp đồng với Hub UrbanB không.
- **Rủi ro**: có đổi thứ đang chạy ở máy chủ, ở máy khách sạn, trong Sheet thật không.
- **Vòng kiểm**: test nào, có phải chạy thử trên máy thật, mấy lần chờ người dùng duyệt.
- **Độ mở**: còn bao nhiêu câu hỏi nghiệp vụ chưa có lời.
- **Context**: làm trọn trong một phiên được không, hay phải chia mục.

Kết luận bằng một mức: **gọn** (một lượt, ít rủi ro), **vừa** (nhiều mục, có cổng phải qua),
**nặng** (nhiều repo, đổi thứ đang chạy thật, nhiều vòng duyệt), kèm lý do theo các trục trên.

### Chất lượng trước, không sợ tốn công

- Khi đưa các lối hoặc khuyến nghị, xếp theo cái tốt nhất cho người dùng, không theo số tệp
  phải sửa. Vẫn ghi giá để người dùng biết, nhưng giá không phải lý do khuyến nghị: câu
  "chỉ sửa 1 tệp" không được dùng làm lý lẽ.
- Gốc lỗi nằm sâu thì sửa gốc, không vá chữ để che triệu chứng.
- Giới hạn: không bịa luật nghiệp vụ; vẫn bàn trước rồi mới làm; không tự mở rộng phạm vi.
  Muốn làm rộng hơn yêu cầu thì đề xuất trước.

### Việc ra ngoài repo: xin duyệt từng việc

- Push, deploy, chép lên máy chủ, sửa cron, chạy job thật, ghi Sheet hay Hub thật, gọi API
  ngoài có tác dụng phụ: mỗi việc một lần duyệt. Lời chốt một câu hỏi không phải lời duyệt
  cho những việc này.
- Bị chặn quyền thì soạn lệnh cho người dùng tự chạy. Không tìm lối vòng, không nhờ phiên
  hay agent khác làm thay.

### Bí mật

- Không in token, mật khẩu, cookie, nội dung `*.env` ra màn hình, log, báo cáo, commit hay
  lệnh đưa người dùng. Agent không đăng nhập và không gõ mật khẩu thay người dùng.

### Không bịa luật nghiệp vụ

- Nguồn sự thật là `../UrbanB/kb/` (bắt đầu từ `kb/AGENTS.md`). Tệp `draft` thì nói rõ phần
  nào là giả định.
- Không tự đặt chuỗi duyệt, trạng thái quy trình, công thức KPI, SLA, cách chấm điểm, luật
  thông báo. Thiếu thì hỏi.
- Không hard-code con số nghiệp vụ. Thuật ngữ khớp `../UrbanB/kb/00-glossary.md`.

### Đo trước khi tin

- Mỗi kết luận dán nhãn **ĐO** (kèm lệnh đã chạy và kết quả) hoặc **SUY**. Không có kết quả
  lệnh nghĩa là lệnh chưa chạy.
- Sau push phải đo lại (`git rev-list --count origin/<nhánh>..<nhánh>` bằng 0) rồi mới báo xong.
- `ssh urbanb` là VPS mặt tiền (`45.252.249.161`), không phải máy chạy app và job. Máy chạy
  app và job là `urbanb-app`.

### Git

- Chỉ `git add <đường-cụ-thể>`; không `git add -A`, `git add .`, `git commit -am`.
- Commit sau từng mục việc, để mất phiên giữa chừng thì phần đã xong vẫn còn.
- Việc theo một yêu cầu YC của UrbanB thì làm ở worktree riêng `../<repo>-ycNNN`, nhánh mang
  mã YC.

### Test là hợp đồng

- Thêm luật thì thêm test phản chứng: gỡ luật đi thì test phải đỏ. Test vẫn xanh khi xoá mã
  nó nói là che còn tệ hơn không có test.

### Chạy như làn của điều phối UrbanB

- Có `PROMPT-LAN.md` thì đọc trước mọi việc và làm đúng thứ tự trong đó.
- Không hỏi người dùng trực tiếp: câu hỏi chặn gửi về điều phối, hoặc trả `STATUS: BLOCKED`.
- Không merge, không push. Tin cuối mở đầu `STATUS: GATE|BLOCKED|NEED_LOCK` kèm sha.

### Lệnh đưa người dùng tự chạy

- Không mở đầu bằng dòng chú thích (zsh không bật `interactivecomments`).
- Mở đầu bằng `cd <đường tuyệt đối của repo> &&`, vì terminal hay đứng ở repo khác.
- `ssh` trong lệnh nhiều dòng thì dùng `ssh -n`, kẻo nó nuốt các dòng sau.

### Văn phong trả lời

- Trả lời tiếng Việt nén: bỏ chữ thừa, giữ nguyên thuật ngữ, tên hàm, lệnh, mã lỗi.
- Viết chữ "không", đừng dùng icon thay chữ. Không tự đặt viết tắt mới.
- Không nén ở tài liệu, commit message, chú thích trong mã, chữ hiện cho người dùng cuối,
  cảnh báo huỷ dữ liệu.

### Tìm kiếm

- `rg <mẫu> <đường>`: luôn ghi đường, vì `rg` trần trong Bash đọc stdin và treo.
- Không quét `find` hay `grep -r` qua `node_modules`, `vendor/`, hay cả thư mục `Projects/`.

### Hợp đồng với Hub UrbanB

- Extension gửi lên Hub qua `extension/hub.js`: `POST <hub>/api/ingest/reviews`. Hợp đồng do
  UrbanB giữ ở `../UrbanB/src/app/api/ingest/reviews/route.ts`. Repo này chỉ đọc bên ấy.
- Không gửi trường Hub chưa nhận. Máy khách sạn chạy bản cũ tới khi tự cập nhật, nên Hub phải
  nhận được cả dạng dữ liệu của bản extension cũ.

## Bản đồ

| Đường dẫn | Nội dung |
|---|---|
| `extension/background.js` | Lịch quét, điều phối, gửi Sheet / Hub |
| `extension/scanners.js` | Gọi API nội bộ của từng extranet. Kênh đổi giao diện thì sửa ở đây |
| `extension/normalize.js` | Chuẩn hoá review về một dạng, gỡ tên khách |
| `extension/config.js` | `VERSION`, `CHANNELS`, `DEFAULT_CONFIG` (lưu trong `chrome.storage.local`) |
| `extension/update.js` | Kiểm bản mới trên GitHub, `UPDATE_COMMAND` |
| `extension/setup-code.js` | Mã cài đặt `URB1.…` (Sheet tạo, `cai-dat.ps1` ghi ra `ma-cai-dat.txt`, extension tự áp) |
| `extension/hub.js`, `report.js`, `capture.js`, `nav.js` | Gửi Hub, mã lỗi, chụp request, mở tab |
| `apps-script/Code.gs` | Web App nhận dữ liệu: ghi không trùng, tab Thống kê, Máy cài, Nhật ký lỗi |
| `windows/cai-dat.ps1` | Lệnh cài / cập nhật trên Windows (`irm … \| iex`) |
| `docs/` | Cài đặt, cài từ xa, mã lỗi, sơ đồ kiến trúc |
| `test/*.test.mjs` | `node --test`. `apps-script.test.mjs` nạp `Code.gs` trong `vm` |
| `src/scripts/` | Script Playwright đo khả thi lúc đầu. Không còn dùng, đừng sửa theo nó |

## Lệnh

```bash
npm test
```

## Ra bản mới

1. Tăng phiên bản ở **cả hai** chỗ: `extension/manifest.json` (`version`) và `VERSION` trong
   `extension/config.js`. Extension chỉ tự nạp lại khi số phiên bản trên đĩa tăng.
2. `npm test`.
3. Đẩy lên `main` của `taiituan13/UrbanB-Thu-review-OTA`. Các máy đọc manifest trên `main` rồi báo
   có bản mới.
4. Nếu sửa `Code.gs`: người dùng dán lại và triển khai **Phiên bản mới**. Không chạy lại `setup`.

## Không được làm khi chưa có lệnh rõ của người dùng

- Không push lên `main`. Push là phát hành tới mọi KS. Không commit nếu chưa được bảo.
- Không mở extranet hay đăng nhập thay người dùng.
- Không commit `.profile/` (profile Chrome có cookie đăng nhập), `out/` hay `.env`.

## Bất biến

Đổi bất kỳ mục nào dưới đây sẽ làm hỏng máy đã cài:

- Tên repo GitHub và nhánh `main`. Dùng trong `update.js` (`REPO`, `REMOTE_MANIFEST_URL`), trong
  `UPDATE_COMMAND` và trong `windows/cai-dat.ps1` (tải `main.zip`).
- Thư mục `extension/` ở gốc repo, có `manifest.json` nằm ngay trong đó. Đường dẫn `windows/cai-dat.ps1`.
  Thư mục cài `C:\UrbanB\extension`.
- `test/update.test.mjs` kiểm `UPDATE_COMMAND` có mặt trong `cai-dat.ps1` và `docs/cai-tu-xa.md`.
- Mã cài đặt: tiền tố `URB1.`, biến `$UrbanBMa`, tệp `ma-cai-dat.txt` (cũng nằm trong `/XF` của
  robocopy). Lệnh đã gửi cho KS mang các tên này. Đổi dạng mã thì tăng `v`, giữ đọc được `v: 1`.
- Tên tab và tên cột trong Sheet: tab cũ được xếp lại theo **tên** cột. Muốn đổi tên thì phải thêm
  vào `RENAMED_LABELS`.
- Script Properties của Code.gs: `SECRET` (mã bí mật dán vào extension), `FORMULA_SEP`.
  `WEBAPP_URL`, `HUB_URL`, `HUB_TOKEN` chỉ để hộp thoại "Tạo lệnh cài" điền sẵn.

## Định danh khách sạn

Chưa có danh sách KS chung. Tên `hotel` của máy đến từ mã cài đặt (hộp thoại "Tạo lệnh cài" gợi ý
tên đã có ở tab `Máy cài`) hoặc do người cài gõ tay, và tab `Máy cài` lấy tên đã chuẩn hoá
(`normalizeName`) làm khoá. Dự định dùng Sheet "OTA Sync - Quản trị" (repo
`../ezcloud-ota-booking-sync`) làm danh sách chung. Mã KS ở đó là `PCT`, `MTT`, …
