# UrbanB — Thu review OTA

Chrome extension đọc review của khách sạn từ extranet **Booking**, **Agoda**, **Trip**, **Expedia**, **Traveloka** và **Go2Joy**
bằng phiên đăng nhập sẵn có trên máy, rồi gửi lên Hub UrbanB theo phiên đăng nhập Hub của người dùng
máy (xem `docs/cai-dat.md` mục 6). Từ bản 1.5.2 (YC-228) extension không ghi Google Sheet review nữa.
Mỗi khách sạn cài một bản trên máy của mình.

Extension chỉ đọc: nó không trả lời review và không đổi cài đặt nào trên extranet.
Tên khách bị gỡ trước khi gửi đi.

Hướng dẫn cho AI: `CLAUDE.md`. Các công cụ UrbanB khác: `../UrbanB-tools.md`.

## Chạy ở đâu

| Phần | Ở đâu | Cập nhật |
|---|---|---|
| Extension | Chrome trên máy từng KS, thư mục `C:\UrbanB\extension` | Người ở KS dán lệnh cập nhật (popup hiện dải vàng khi có bản mới) |
| `apps-script/Code.gs` | Apps Script gắn trong Sheet review chung. Không còn nhận review từ bản 1.5.2; giữ cho máy chưa lên bản và menu Tạo lệnh cài | Dán tay, rồi triển khai **Phiên bản mới** (không chạy lại `setup`) |
| Lệnh cài | `windows/cai-dat.ps1`, tải từ nhánh `main` trên GitHub | Đẩy lên `main` là mọi máy thấy bản mới |

## Thành phần

| Thư mục | Nội dung |
|---|---|
| `extension/` | Chrome extension (Manifest V3): quét theo giờ, chuẩn hoá, gửi lên Hub |
| `apps-script/Code.gs` | Điểm nhận Sheet của bản tới 1.5.1: ghi không trùng, tab Thống kê, Máy cài, Nhật ký lỗi |
| `docs/cai-dat.md` | Hướng dẫn cài extension (và Sheet review cũ) |
| `docs/cai-tu-xa.md` | Cài cho khách sạn trên Windows bằng một lệnh (Sheet tạo lệnh kèm mã cài đặt riêng từng KS) |
| `windows/cai-dat.ps1` | Lệnh cài (và cập nhật, khi chạy lại) trên Windows |
| `docs/ma-loi.md` | Mã lỗi: khách sạn gửi mã nào, người quản lý tra ở đâu, từng loại lỗi xử lý ra sao |
| `docs/hop-dong-hub-bridge.md` | Hợp đồng giữa trang Hub và extension trên máy quầy: trạng thái máy (`ext:status`), quét trước khi giao ca (`ext:scan`) |
| `test/` | Test cho phần chuẩn hoá, gửi Hub, Code.gs và thống kê (`npm test`) |
| `src/scripts/` | Script đo khả thi ban đầu (Playwright), không còn dùng |

## Bắt đầu

Cài cho từng khách sạn theo [docs/cai-tu-xa.md](docs/cai-tu-xa.md): người ở khách sạn dán lệnh cài,
nạp extension vào Chrome rồi đăng nhập Hub là extension tự nhận tên cơ sở, kênh quét và mã chỗ nghỉ từ
Hub (từ bản 1.2.0). Lệnh riêng có mã cài đặt vẫn tạo được bằng menu **Review OTA › Tạo lệnh cài cho
khách sạn** trong Sheet review cũ.

Lệnh cài tải mã từ nhánh `main` của repo này. Ra bản mới thì tăng phiên bản ở cả
`extension/manifest.json` lẫn `VERSION` trong `extension/config.js`: extension chỉ tự nạp lại khi
số phiên bản trên đĩa tăng.

## Test

```bash
npm test        # node --test test/*.test.mjs, không gọi mạng
```

## Lỗi

Máy KS gửi mã lỗi dạng `<kênh>-…`, `HUB-…` (`SHEET-…` ở bản tới 1.5.1): tra ở
[docs/ma-loi.md](docs/ma-loi.md). Từ bản 1.5.2 lỗi không lên tab `Nhật ký lỗi` của Sheet nữa. Sự cố khi cài: [docs/cai-tu-xa.md](docs/cai-tu-xa.md) mục *Khi có sự cố*.

## Giới hạn

Endpoint là API nội bộ của extranet, đo ngày 07–08/10/2026. Khi kênh đổi giao diện,
extension sẽ báo lỗi ở kênh đó và phải sửa `extension/scanners.js`.
