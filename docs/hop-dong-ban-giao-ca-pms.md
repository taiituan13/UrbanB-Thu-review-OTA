# Hợp đồng: số Bàn giao ca từ PMS ezCloud về Hub (YC-246)

Bản 27/10/2026. Bên gửi: extension Urban B trên máy quầy (repo `urbanb-reviews`, từ bản 1.5.5). Bên nhận:
Hub UrbanB, route `POST /api/extension/shift-handover`. Bản gốc của hợp đồng này ở phía Hub:
`UrbanB/docs/hop-dong-ban-giao-ca-pms.md`. Đổi một bên thì sửa cả hai.

Route nhận **hai dạng thân tin**:

- **Lượt đọc lúc Quét** (`"kind": "reading"`, từ 27/10/2026). Đây là nguồn của ô **Số sổ ezCloud**.
- **Lượt bấm Bàn giao** (không có `kind`, dạng của 26/10/2026). Hub vẫn nhận và lưu, để máy đã nạp bản 1.5.5 đầu
  tiên không báo lỗi, nhưng trang Giao ca quầy không còn đọc dạng này.

## Vì sao có hợp đồng này

Ô **Số sổ ezCloud** trên trang Giao ca quầy (`/front-desk/handover`) là số **"Bàn giao cho ca sau"** (dòng 7 trang
Bàn giao ca của PMS).

- 26/10/2026, `H-2034` b: lấy số lễ tân chốt khi bấm **Bàn giao** trên PMS.
- 27/10/2026, user đổi: *"không bấm bàn giao, cứ lấy số tại thời điểm giao diện có"*. Chốt Q1 a: lúc lễ tân bấm
  **Quét** trên Hub, máy tự tính số ấy từ ca ezCloud đang mở. Chốt Q2 b: máy không có tab PMS thì tự mở một tab
  PMS nền để đọc; đọc không được thì ô ghi "Chưa lấy được số ezCloud" và lễ tân vẫn Chốt được.

Đo 26/10/2026: trang Bàn giao ca của PMS chỉ gọi `GET api/Shift/GetCurrentShift?shiftId=0`. Ở ca đang mở, máy chủ
ezCloud không giữ dòng 7 (`MoneyNextShift = 0`); trình duyệt tự tính **Đầu ca + Tổng thu − Tổng chi** (khớp 2/2
ca đo được) và lễ tân sửa tay được. Lượt đọc lúc Quét tính đúng con số trang hiện khi lễ tân chưa sửa tay.

## Lượt đọc lúc Quét (`kind: "reading"`)

- Trang Giao ca quầy gửi `ext:scan` kèm `requestId` (chính là mã lượt quét `scanCode` của Hub). Song song với lượt
  quét review, extension đọc ca ezCloud đang mở trong **mọi tab `pms.ezcloudhotel.com`** của máy: chạy
  `GET /api/Shift/GetCurrentShift?shiftId=0` ngay trong trang (world MAIN). Xác thực lần lượt: token Bearer chính
  trang vừa gửi kèm request (`capture.js` giữ trong trang, không chuyển đi đâu), rồi phiên cookie, rồi JWT trang
  giữ trong bộ nhớ; dừng ở lần đầu ezCloud nhận. Đo 27/10/2026 trên PMS 17200: chỉ token trang được 200, cookie và
  JWT trong bộ nhớ đều 401 (bản 1.5.6 chỉ thử hai cách sau nên chưa lấy được số nào). Không đổi khách sạn mặc định,
  không gọi lệnh ghi nào.
- Từ 1.5.8: tab chưa có token trang thì chờ trang gửi một request (tối đa 3 giây ở tab sẵn có, 6 giây ở tab máy vừa
  mở). Mọi tab PMS sẵn có đều bị ezCloud từ chối ⇒ mở thêm một tab PMS nền và đọc lại ở đó. Lý do, đo 27/10/2026
  trên máy quầy: tab PMS mở từ trước khi extension nạp lại vẫn chạy `capture.js` bản cũ, không giữ token, nên bị
  401 tới khi lễ tân F5.
- Lượt đọc không gửi được số nào ⇒ máy ghi một mã `PMS_READING_*` (`readingFaultCode`) vào `problems` của lượt báo
  sống (`NO_PAGE` · `NO_TOKEN` · `AUTH` · `PMS_ERROR` · `NO_SHIFT` · `HUB_REJECTED`); lượt sau gửi được thì xoá.
  `NO_TOKEN` là ezCloud từ chối mà trang chưa gửi token nào; `AUTH` là ezCloud từ chối cả token trang. Hub chưa
  khai các mã này thì hiện ở nhóm "lỗi khác" kèm mã.
- Máy không có tab PMS nào ⇒ mở một tab `https://pms.ezcloudhotel.com/` nền (không giật tiêu điểm, không vào nhóm
  tab quét review), đọc xong đóng.
- Chỉ gửi khi ezCloud trả `Code === 0` và ca đang mở (`IsFinish === false`). Mỗi khách sạn một lượt.
- `ext:scan-result` chỉ tới trang **sau** khi lượt đọc đã gửi Hub xong (trần 30 giây), vì trang nhận kết quả là
  hỏi Hub số ezCloud của đúng `scanCode` ấy.
- Không xếp hàng, không gửi lại: lượt đọc chỉ có nghĩa cho lần Quét đang chờ.

```json
{
  "kind": "reading",
  "scanCode": "K7M2PQ",
  "ezcloudHotelId": "17704",
  "ezShiftId": 52011,
  "ezShiftNumber": 14,
  "shiftOpenedAt": "2026-10-26T07:00:00",
  "money": [{ "name": "VND", "begin": 260000, "revenue": 1500000, "expenditure": 200000 }],
  "readAt": "2026-10-27T02:00:00.000Z",
  "extensionVersion": "1.5.5"
}
```

| Trường | Kiểu | Nguồn |
|---|---|---|
| `kind` | `"reading"` | cố định |
| `scanCode` | chuỗi | `requestId` của `ext:scan` |
| `ezcloudHotelId` | chuỗi chữ số | `Data.HotelId` |
| `ezShiftId` | số nguyên dương | `Data.ShiftId` |
| `ezShiftNumber` | số nguyên ≥ 0 hoặc `null` | `Data.ShiftNumber` |
| `shiftOpenedAt` | chuỗi hoặc `null` | `Data.CreateDate` (giờ ezCloud, không kèm múi giờ) |
| `money` | mảng ≤ 10 phần tử | `Data.ListShiftDetailModels[]`: `MoneyName`, `MoneyBeginShift`, `TotalRevenue`, `TotalExpenditure` |
| `readAt` | chuỗi ISO 8601 | giờ máy quầy lúc đọc |
| `extensionVersion` | `x.y.z` | `manifest.json` |

**Hub** chọn dòng `name = "VND"` và tính số "Bàn giao cho ca sau" = `begin + revenue − expenditure`; âm thì ô ghi
0 kèm số gốc (`H-835` a), đúng như PMS kẹp dòng 6 "Thực tế trong két" về 0. Extension không tính số nào.
Hub trả lời như bảng Response bên dưới; trùng `scanCode` ở cùng cơ sở ⇒ giữ lượt đầu, `duplicate: true`.

## Phía extension: bắt lượt Bàn giao (dạng 26/10/2026)

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
- Luật thân tin (repo UrbanB): lượt đọc ở `src/modules/payments/handover/pms-reading.rules.ts`
  (`parsePmsReadingReport`), lượt bấm Bàn giao ở `pms-handover.rules.ts` (`parsePmsHandoverReport`).

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
