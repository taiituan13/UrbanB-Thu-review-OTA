# UrbanB — Thu review OTA

Chrome extension đọc review của khách sạn từ extranet **Booking**, **Agoda**, **Trip**, **Expedia**, **Traveloka** và **Go2Joy**
bằng phiên đăng nhập sẵn có trên máy, rồi gom tất cả về một Google Sheet chung. Máy nào điền
URL Hub thì gửi thêm một bản lên Hub UrbanB (xem `docs/cai-dat.md` mục 6).
Mỗi khách sạn cài một bản trên máy của mình.

Extension chỉ đọc: nó không trả lời review và không đổi cài đặt nào trên extranet.
Tên khách bị gỡ trước khi gửi đi.

Hướng dẫn cho AI: `CLAUDE.md`. Các công cụ UrbanB khác: `../UrbanB-tools.md`.

## Chạy ở đâu

| Phần | Ở đâu | Cập nhật |
|---|---|---|
| Extension | Chrome trên máy từng KS, thư mục `C:\UrbanB\extension` | Người ở KS dán lệnh cập nhật (popup hiện dải vàng khi có bản mới) |
| `apps-script/Code.gs` | Apps Script gắn trong Sheet review chung | Dán tay, rồi triển khai **Phiên bản mới** (không chạy lại `setup`) |
| Lệnh cài | `windows/cai-dat.ps1`, tải từ nhánh `main` trên GitHub | Đẩy lên `main` là mọi máy thấy bản mới |

## Thành phần

| Thư mục | Nội dung |
|---|---|
| `extension/` | Chrome extension (Manifest V3): quét theo giờ, chuẩn hoá, gửi lên Sheet và Hub |
| `apps-script/Code.gs` | Điểm nhận trên Google Apps Script: ghi không trùng, tab Thống kê, Máy cài, Nhật ký lỗi |
| `docs/cai-dat.md` | Hướng dẫn tạo Sheet và cài extension |
| `docs/cai-tu-xa.md` | Cài cho khách sạn trên Windows bằng một lệnh (Sheet tạo lệnh kèm mã cài đặt riêng từng KS) |
| `windows/cai-dat.ps1` | Lệnh cài (và cập nhật, khi chạy lại) trên Windows |
| `docs/ma-loi.md` | Mã lỗi: khách sạn gửi mã nào, người quản lý tra ở đâu, từng loại lỗi xử lý ra sao |
| `test/` | Test cho phần chuẩn hoá, ghi Sheet, gửi Hub và thống kê (`npm test`) |
| `src/scripts/` | Script đo khả thi ban đầu (Playwright), không còn dùng |

## Bắt đầu

Tạo Sheet theo [docs/cai-dat.md](docs/cai-dat.md), rồi cài cho từng khách sạn theo
[docs/cai-tu-xa.md](docs/cai-tu-xa.md): menu **Review OTA › Tạo lệnh cài cho khách sạn** trong
Sheet sinh một lệnh PowerShell riêng cho khách sạn đó; người ở khách sạn dán lệnh, nạp extension
vào Chrome là extension tự điền Cài đặt và tự thử Sheet.

Lệnh cài tải mã từ nhánh `main` của repo này. Ra bản mới thì tăng phiên bản ở cả
`extension/manifest.json` lẫn `VERSION` trong `extension/config.js`: extension chỉ tự nạp lại khi
số phiên bản trên đĩa tăng.

## Test

```bash
npm test        # node --test test/*.test.mjs, không gọi mạng
```

## Lỗi

Máy KS gửi mã lỗi dạng `<kênh>-…`, `SHEET-…`, `HUB-…`: tra ở [docs/ma-loi.md](docs/ma-loi.md) và tab
`Nhật ký lỗi` của Sheet. Sự cố khi cài: [docs/cai-tu-xa.md](docs/cai-tu-xa.md) mục *Khi có sự cố*.

## Giới hạn

Endpoint là API nội bộ của extranet, đo ngày 07–08/10/2026. Khi kênh đổi giao diện,
extension sẽ báo lỗi ở kênh đó và phải sửa `extension/scanners.js`.
