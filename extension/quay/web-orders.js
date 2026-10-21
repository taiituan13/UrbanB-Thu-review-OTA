// Đơn web urbanb.vn lệch số booking (YC-171, user chốt 21/10/2026) — khối trên tab Booking OTA của khung quầy.
//
// Apps Script của khách sạn đọc thư đặt phòng của urbanb.vn rồi tạo booking ezCloud, mỗi phòng một booking.
// Sau mỗi lượt chạy nó đẩy về Hub "thư có N phòng, đã tạo k booking". Hub giữ đơn LỆCH (N ≠ k, H-1669 a)
// tới khi lễ tân bấm "Đã xử lý" (H-1669 a); khung quầy hiện các đơn ấy ở tab Booking OTA (H-1668 c).
//
// Hợp đồng Hub (repo UrbanB, `src/app/api/extension/web-orders/route.ts`):
//   GET  /api/extension/web-orders?ezcloudHotelId=<mã>  ⇒ { ok, branch, canResolve, orders: [...] }
//   POST /api/extension/web-orders  { ezcloudHotelId, id } ⇒ { ok, orders } | { ok: false, error }
// Thân không mang tên, số điện thoại hay email khách (H-1670): mã đơn đủ để lễ tân tra trên PMS.
// Logic thuần, không đọc DOM; gọi mạng qua `fetchJson` do service worker cấp.

export const WEB_ORDERS_PATH = "/api/extension/web-orders";

export function webOrdersUrl(origin, hotelId) {
  return origin + WEB_ORDERS_PATH + "?" + new URLSearchParams({ ezcloudHotelId: hotelId }).toString();
}

const count = (v) => (Number.isInteger(v) && v >= 0 ? v : null);

/** Một dòng đơn từ Hub ⇒ dòng khung dùng; dòng thiếu mã, thiếu số, hay không lệch bị bỏ. */
function parseOrder(o) {
  if (!o || typeof o !== "object") return null;
  const id = typeof o.id === "string" ? o.id : "";
  const orderCode = typeof o.orderCode === "string" ? o.orderCode : "";
  const roomCount = count(o.roomCount);
  const createdCount = count(o.createdCount);
  if (!id || !orderCode || roomCount === null || createdCount === null || roomCount === createdCount) return null;
  const str = (v) => (typeof v === "string" ? v : "");
  return { id, orderCode, roomCount, createdCount, roomTypes: str(o.roomTypes), checkIn: str(o.checkIn), checkOut: str(o.checkOut), receivedAt: str(o.receivedAt) };
}

/** Lời đáp `{ ok: true, orders }` ⇒ `{ orders, canResolve }`; hình sai ⇒ null. */
export function parseWebOrders(json) {
  if (!json || json.ok !== true || !Array.isArray(json.orders)) return null;
  return { orders: json.orders.map(parseOrder).filter(Boolean), canResolve: json.canResolve === true };
}

/** "21/10 14:00" theo giờ máy quầy; chuỗi hỏng ⇒ "". */
export function dayTime(at) {
  if (!at) return "";
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * Chữ của một thẻ đơn lệch. Chỉ nói sự thật đọc được (số phòng trong thư, số booking đã tạo) và việc tra
 * trên PMS; không tự đặt luật xử lý nào khác.
 */
export function webOrderCard(o) {
  const missing = o.roomCount - o.createdCount;
  const gap =
    missing > 0
      ? `Thư có ${o.roomCount} phòng, Apps Script mới tạo ${o.createdCount} booking ezCloud: thiếu ${missing} booking.`
      : `Thư có ${o.roomCount} phòng, Apps Script đã tạo ${o.createdCount} booking ezCloud: thừa ${-missing} booking.`;
  const stay = [dayTime(o.checkIn), dayTime(o.checkOut)].filter(Boolean).join(" đến ");
  return {
    title: `Đơn web urbanb.vn ${o.orderCode}`,
    gap,
    meta: [o.roomTypes, stay].filter(Boolean).join(" | "),
    todo: missing > 0 ? "Tra mã đơn trên PMS, nhập tay phòng còn thiếu, rồi bấm Đã xử lý." : "Tra mã đơn trên PMS, kiểm booking thừa, rồi bấm Đã xử lý.",
    received: dayTime(o.receivedAt),
  };
}

/** Lời đáp GET ⇒ trạng thái; dùng chung bảng lỗi của mọi route extension (`classifyHubReply`). */
export function listState(cls) {
  if (cls.state !== "ok") return { state: cls.state, why: cls.why, message: cls.message };
  const parsed = parseWebOrders(cls.data);
  return parsed ? { state: "ok", ...parsed } : { state: "server", message: "Hub trả danh sách đơn web sai hình" };
}

/** Lời đáp POST "Đã xử lý". `NOT_FOUND` = đơn đã có người xử lý hoặc không còn lệch: tải lại danh sách. */
export function resolveState(reply) {
  if (!reply || reply.netError) return { ok: false, text: "Không gọi được Hub. Thử lại sau." };
  const json = reply.json;
  if (json?.ok === true) {
    const parsed = parseWebOrders(json);
    return { ok: true, orders: parsed ? parsed.orders : null, text: "Đã ghi Đã xử lý." };
  }
  if (reply.status === 401 || json?.error === "NOT_SIGNED_IN") return { ok: false, state: "out", text: "Phiên Hub đã hết. Đăng nhập lại rồi bấm lại." };
  if (json?.error === "NOT_FOUND") return { ok: false, gone: true, text: "Đơn này đã có người bấm Đã xử lý, hoặc không còn lệch." };
  if (json?.error === "OUT_OF_SCOPE") return { ok: false, text: "Tài khoản này không có quyền bấm Đã xử lý ở cơ sở này." };
  if (json?.error === "STAGE_RESTRICTED") return { ok: false, text: "Tài khoản đang ở giai đoạn chưa được bấm Đã xử lý." };
  return { ok: false, text: `Hub trả lỗi ${reply.status ?? ""}`.trim() };
}

/** Thân POST "Đã xử lý". */
export function resolveInit(hotelId, id) {
  return { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ezcloudHotelId: hotelId, id }) };
}
