# UrbanB — Thu review OTA

Chrome extension đọc review của khách sạn từ extranet **Booking**, **Agoda** và **Trip**
bằng phiên đăng nhập sẵn có trên máy, rồi gom tất cả về một Google Sheet chung.
Mỗi khách sạn cài một bản trên máy của mình.

Extension chỉ đọc: nó không trả lời review và không đổi cài đặt nào trên extranet.
Tên khách bị gỡ trước khi gửi đi.

## Thành phần

| Thư mục | Nội dung |
|---|---|
| `extension/` | Chrome extension (Manifest V3): quét theo giờ, chuẩn hoá, gửi lên Sheet |
| `apps-script/Code.gs` | Điểm nhận trên Google Apps Script: ghi không trùng, tab Thống kê |
| `docs/cai-dat.md` | Hướng dẫn tạo Sheet và cài extension |
| `test/` | Test cho phần chuẩn hoá, ghi Sheet và thống kê (`npm test`) |
| `src/scripts/` | Script đo khả thi ban đầu (Playwright) |

## Bắt đầu

Làm theo [docs/cai-dat.md](docs/cai-dat.md).

## Giới hạn

Endpoint là API nội bộ của extranet, đo ngày 07/10/2026. Khi kênh đổi giao diện,
extension sẽ báo lỗi ở kênh đó và phải sửa `extension/scanners.js`.
