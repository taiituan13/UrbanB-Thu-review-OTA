# Thu review OTA (urbanb-reviews) — hướng dẫn cho AI

Chrome extension (Manifest V3, JS thuần, không build) đọc review khách sạn từ extranet Booking,
Agoda, Trip, Expedia, Traveloka, Go2Joy bằng phiên đăng nhập sẵn có trên máy KS. Review được gửi
lên một Google Sheet chung (`apps-script/Code.gs`) và tuỳ chọn lên UrbanB Hub. Mỗi KS cài một bản.
Người dùng đọc tiếng Việt: trả lời, giao diện, thông báo và tài liệu đều viết tiếng Việt.

Tài liệu cho người: `README.md`, `docs/`. Các công cụ UrbanB khác: `../UrbanB-tools.md`.

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
