# Hợp đồng: số Bàn giao ca từ PMS ezCloud về Hub (YC-246)

Bản 26/10/2026. Bên gửi: extension Urban B trên máy quầy (repo `urbanb-reviews`, từ bản 1.5.5). Bên nhận:
Hub UrbanB, route `POST /api/extension/shift-handover`. Bản gốc của hợp đồng này ở phía Hub:
`UrbanB/docs/hop-dong-ban-giao-ca-pms.md`. Đổi một bên thì sửa cả hai.

## Vì sao có hợp đồng này

User chốt `H-2034` b ngày 26/10/2026: ô **Số sổ ezCloud** trên trang Giao ca quầy (`/front-desk/handover`) là số
**"Bàn giao cho ca sau"** (dòng 7 trang Bàn giao ca của PMS) mà lễ tân vừa chốt khi bấm **Bàn giao** trên PMS.

Đo 26/10/2026: ở ca đang mở, máy chủ ezCloud không giữ dòng 7 (`GetCurrentShift` trả `MoneyNextShift = 0`).
Trình duyệt tự tính Đầu ca + Tổng thu − Tổng chi, lễ tân sửa tay được, và con số chốt chỉ rời trình duyệt trong
`POST api/Shift/ShiftHandover`. Vì vậy chỉ extension, đứng trong trang PMS, thấy được con số ấy.

## Phía extension: bắt lượt Bàn giao

- `capture.js` (world MAIN, trên `pms.ezcloudhotel.com`) theo dõi request `POST …/api/Shift/ShiftHandover`, cả
  `fetch` lẫn `XMLHttpRequest`. Không sửa request, không gửi lại request nào tới ezCloud.
- **Chỉ gửi khi ezCloud báo thành công**: HTTP 2xx và thân phản hồi JSON có `Code === 0` (khuôn chung của API
  ezCloud là `{ Code, Message, Data }`, `0` là thành công). Phản hồi khác ⇒ không gửi gì.
- Số lấy từ thân request (object ca, có `ShiftId`, `HotelId`, `ShiftNumber`, `ListShiftDetailModels`), dòng
  `MoneyName = "VND"`. Không có dòng VND ⇒ không gửi.
- **Một lần cho mỗi ca**: khoá chống trùng là `HotelId` × `ShiftId`. Hub lỗi tạm (mất mạng, 5xx, hết phiên,
  Hub cũ chưa có route) ⇒ xếp hàng, gửi lại sau. Hub từ chối hẳn (thân sai, mã khách sạn chưa ghép, ngoài phạm
  vi) ⇒ bỏ khỏi hàng, không gửi lại.
- Hub cũ chưa có route (404 không kèm `error`) ⇒ **không báo lỗi lên khung quầy**; lượt ấy nằm trong hàng chờ.

> ⚠️ **Chưa đo thật** (26/10/2026): hình dạng thân request và phản hồi của `ShiftHandover` mới suy từ bundle
> PMS (`DO-yc27-thuc-te-trong-ket.md`: thân là cả `Data` của ca). Extension đọc phòng thủ: object ca ở gốc
> hoặc trong `Data`. Đo được lượt bấm thật thì ghi lại ở đây.

## Request

```
POST /api/extension/shift-handover
Content-Type: application/json
Cookie: <phiên Hub của người đang đăng nhập trên máy quầy>
```

```json
{
  "ezcloudHotelId": "17704",
  "ezShiftId": 52011,
  "ezShiftNumber": 14,
  "moneyInTheSafe": 1089149572,
  "moneyNextShift": 1089149572,
  "moneyAssignManagement": 0,
  "handedOverAt": "2026-10-26T14:58:10.000Z",
  "extensionVersion": "1.5.5"
}
```

| Trường | Kiểu | Nguồn trên PMS |
|---|---|---|
| `ezcloudHotelId` | chuỗi chữ số hoặc số nguyên dương | `HotelId` của ca |
| `ezShiftId` | số nguyên dương | `ShiftId` |
| `ezShiftNumber` | số nguyên ≥ 0, được thiếu hoặc `null` | `ShiftNumber` |
| `moneyInTheSafe` | số, ≤ 3 chữ số thập phân | dòng 6 "Thực tế trong két" |
| `moneyNextShift` | số, ≤ 3 chữ số thập phân | dòng 7 "Bàn giao cho ca sau" |
| `moneyAssignManagement` | số, ≤ 3 chữ số thập phân | dòng 8 "Bàn giao cho quản lý" |
| `handedOverAt` | chuỗi ISO 8601 | giờ máy quầy lúc ezCloud báo bàn giao xong |
| `extensionVersion` | `x.y.z` | `manifest.json` |

**Thân tin chỉ có tám khoá trên.** Khoá lạ ⇒ Hub từ chối cả thân tin (`INVALID_BODY`). Thân tin **không** mang
token ezCloud, tên lễ tân, email hay bất kỳ trường nào khác của object ca. Người gửi là người đăng nhập Hub,
Hub đọc từ cookie phiên.

`handedOverAt` đi sau giờ máy chủ thì Hub lấy giờ máy chủ.

## Hub kiểm gì

- Route không đi qua proxy, để trả lỗi JSON thay vì trang `/login`. Nó tự chặn gọi chéo nguồn
  (`extensionWriteAllowed`) và chặn giai đoạn Học việc, như `web-orders`.
- Cơ sở = cơ sở ghép với `ezcloudHotelId` (`capacity_hotel_links`), **và** người đăng nhập có quyền
  `counter_handover.create` tại đúng cơ sở ấy (`resolveCounterBranchFor`).
- Luật thân tin (repo UrbanB): `src/modules/payments/handover/pms-handover.rules.ts` (`parsePmsHandoverReport`).

## Response

| HTTP | Thân | Extension làm gì |
|---|---|---|
| 200 | `{ "ok": true, "duplicate": false }` | bỏ khỏi hàng, ghi đã gửi |
| 200 | `{ "ok": true, "duplicate": true }` | cùng ca đã có trên Hub; bỏ khỏi hàng |
| 400 | `{ "ok": false, "error": "INVALID_BODY" \| "MISSING_HOTEL" }` | bỏ, không gửi lại |
| 401 | `{ "ok": false, "error": "NOT_SIGNED_IN" }` | giữ trong hàng, ghi phiên "out" |
| 403 | `{ "ok": false, "error": "OUT_OF_SCOPE" \| "FORBIDDEN_ORIGIN" \| "STAGE_RESTRICTED" }` | bỏ, không gửi lại |
| 404 | `{ "ok": false, "error": "HOTEL_NOT_LINKED" }` | bỏ, không gửi lại |
| 404 | không có `error` (Hub cũ chưa có route) | giữ trong hàng, không báo lỗi |
| 5xx, mất mạng | — | giữ trong hàng |

Gửi lại cùng một ca: Hub giữ dòng đầu tiên và trả `duplicate: true`.
