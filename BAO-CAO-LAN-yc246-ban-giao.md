# Báo cáo làn `lane-yc246-ban-giao` (YC-246, phía extension)

Nhánh `lane/yc246-ban-giao`, nền `main@c680566` (bản 1.5.4). Chưa merge, chưa push: push `main` là phát hành tới
mọi khách sạn, việc ấy do user duyệt. Phía Hub nằm ở nhánh UrbanB `lane/yc246-ban-giao-pms`, báo cáo
`_bmad-output/implementation-artifacts/BAO-CAO-LAN-yc246-ban-giao-pms.md`.

Lời chốt của user: `H-2034` b — extension bắt lượt lễ tân bấm Bàn giao trên PMS ezCloud
(`POST api/Shift/ShiftHandover`) và gửi Hub dòng 7 "Bàn giao cho ca sau", kèm dòng 6 và dòng 8.

## Commit

| Mục | Commit | Nội dung |
|---|---|---|
| ② | `305aff1` | Bản sao hợp đồng `docs/hop-dong-ban-giao-ca-pms.md` (bản gốc ở repo UrbanB) |
| ③ | `d2a6d2a` | Bản 1.5.5: bắt request, dựng thân tin, chống trùng, hàng chờ gửi lại, test |

## Tệp đã sửa

- `extension/quay/shift-handover.js` (mới): phần thuần — nhận ra request Bàn giao, kiểm ezCloud báo thành công
  (HTTP 2xx và `Code === 0`), đọc object ca ở gốc hoặc trong `Data`, dựng thân tin **từng trường một** (không chép
  object ca, vì object ấy có tên người tạo ca và người nhận), chống trùng theo `HotelId` × `ShiftId`, hàng chờ
  có trần và hạn 3 ngày.
- `extension/capture.js` (world MAIN trên PMS): theo dõi request `ShiftHandover` cùng phản hồi của nó, chuyển cho
  `bridge.js`.
- `extension/bridge.js`: chỉ dựng thân tin khi ezCloud báo thành công, rồi gửi service worker.
- `extension/quay/sw.js`, `extension/background.js`: gửi Hub, xếp hàng khi Hub lỗi tạm (mất mạng, 5xx, hết
  phiên); Hub cũ chưa có route (404 không kèm `error`) thì giữ lượt trong hàng chờ mà **không** báo lỗi lên khung
  quầy.
- `extension/manifest.json`, `extension/config.js`: bản 1.5.5. `CHANGELOG.md`: mục 1.5.5.
- Test: `test/ban-giao-ca.test.mjs` (mới, 14 ca).

## Thân tin gửi Hub

Đúng tám khoá: `ezcloudHotelId`, `ezShiftId`, `ezShiftNumber`, `moneyInTheSafe`, `moneyNextShift`,
`moneyAssignManagement`, `handedOverAt`, `extensionVersion`. Không token ezCloud, không tên lễ tân, không email.
Người gửi là người đang đăng nhập Hub trên máy quầy (cookie phiên). Hub từ chối cả thân tin khi có khoá lạ.

## Đo

| Phép đo | Kết quả |
|---|---|
| `npm test` | **ĐO:** 390/390 xanh; riêng `test/ban-giao-ca.test.mjs` 14/14 |
| Đường nạp phía Hub (route thật, máy dev) | **ĐO:** thân tin đúng khuôn ⇒ 200 `duplicate:false`; gửi lại cùng ca ⇒ 200 `duplicate:true` |

## Chưa đo được

- **Khuôn request ShiftHandover của một lượt bấm thật.** Theo luật làn, không bấm Bàn giao trên PMS thật. Khuôn
  đang dựa trên phép đo trang Bàn giao ca (`DO-yc27-thuc-te-trong-ket.md`: thân là cả `Data` của ca); extension
  đọc phòng thủ cả hai chỗ. Phép đo một lượt thật đang chờ user (`yc246-do-shifthandover.md` trong thư mục ghi
  chú chung của điều phối). Lệch khuôn ⇒ extension không gửi gì (không gửi sai số), ô trên Hub ghi "Chưa bàn
  giao trên ezCloud".

## Thứ tự phát hành

Hub phải lên trước hoặc cùng lúc. Extension lên trước thì lượt Bàn giao nằm trong hàng chờ (tối đa 3 ngày) và
được gửi khi Hub có route; khung quầy không báo lỗi.

## Lượt 2 (27/10/2026): đọc số lúc Quét, dọn nhóm tab (YC-246 Q1 a · Q2 b, YC-249)

Báo cáo đầy đủ nằm phía Hub: `UrbanB/_bmad-output/implementation-artifacts/BAO-CAO-LAN-yc246-doc-so-luc-quet.md`.

- `6852012`, `02c026e`: YC-249. Lượt quét xong, hỏng hay bị cắt ngang thì dọn nhóm tab quét. Tab lạ chỉ được tháo
  ra khỏi nhóm, không bị đóng.
- `d65be7e`: lúc lễ tân bấm Quét, extension đọc ca ezCloud đang mở (`GetCurrentShift`) và gửi `kind: "reading"`
  gắn mã lượt quét. Máy không có tab PMS thì extension tự mở một tab nền để đọc.
- `0c387c5`: test chống gửi trùng khi hai tab PMS cùng một khách sạn.
- `ffeba7f`: hợp đồng ghi chỗ đặt luật lượt đọc phía Hub.
- Bản vẫn là 1.5.5. `npm test` 408/408 xanh. Đột biến 8/8 đỏ.
- **Chưa đo trên PMS thật:** đọc bằng phiên của trang, và tab nền tự vào trang có phiên.
