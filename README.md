# UrbanB — Thu review OTA

Chrome extension đọc review của khách sạn từ extranet **Booking**, **Agoda**, **Trip**, **Expedia**, **Traveloka** và **Go2Joy**
bằng phiên đăng nhập sẵn có trên máy, rồi gom tất cả về một Google Sheet chung.
Mỗi khách sạn cài một bản trên máy của mình.

Extension chỉ đọc: nó không trả lời review và không đổi cài đặt nào trên extranet.
Tên khách bị gỡ trước khi gửi đi.

## Thành phần

| Thư mục | Nội dung |
|---|---|
| `extension/` | Chrome extension (Manifest V3): quét theo giờ, chuẩn hoá, gửi lên Sheet |
| `apps-script/Code.gs` | Điểm nhận trên Google Apps Script: ghi không trùng, tab Thống kê, Máy cài, Nhật ký lỗi |
| `docs/cai-dat.md` | Hướng dẫn tạo Sheet và cài extension |
| `docs/cai-tu-xa.md` | Cài cho khách sạn trên Windows bằng một lệnh |
| `windows/cai-dat.ps1` | Lệnh cài (và cập nhật, khi chạy lại) trên Windows |
| `docs/ma-loi.md` | Mã lỗi: khách sạn gửi mã nào, người quản lý tra ở đâu, từng loại lỗi xử lý ra sao |
| `test/` | Test cho phần chuẩn hoá, ghi Sheet và thống kê (`npm test`) |
| `src/scripts/` | Script đo khả thi ban đầu (Playwright) |

## Bắt đầu

Tạo Sheet theo [docs/cai-dat.md](docs/cai-dat.md), rồi cài cho từng khách sạn theo
[docs/cai-tu-xa.md](docs/cai-tu-xa.md).

Lệnh cài tải mã từ nhánh `main` của repo này. Ra bản mới thì tăng phiên bản ở cả
`extension/manifest.json` lẫn `VERSION` trong `extension/config.js`: extension chỉ tự nạp lại khi
số phiên bản trên đĩa tăng.

## Giới hạn

Endpoint là API nội bộ của extranet, đo ngày 07–08/10/2026. Khi kênh đổi giao diện,
extension sẽ báo lỗi ở kênh đó và phải sửa `extension/scanners.js`.
