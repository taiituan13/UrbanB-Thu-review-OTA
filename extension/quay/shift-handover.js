// Số Bàn giao ca từ PMS ezCloud về Hub (YC-246, user chốt H-2034 b ngày 26/10/2026).
//
// Lễ tân bấm Bàn giao trên trang Bàn giao ca của PMS ⇒ capture.js (world MAIN) thấy `POST api/Shift/ShiftHandover`
// và phản hồi của nó, chuyển cho bridge.js; bridge.js dùng tệp này dựng thân tin rồi gửi service worker; service
// worker xếp hàng và gửi Hub. Ô "Số sổ ezCloud" trên trang Giao ca quầy của Hub đọc số này.
//
// Hợp đồng: docs/hop-dong-ban-giao-ca-pms.md (bản gốc ở repo UrbanB). Thân tin CHỈ gồm số và mã, dựng từng
// trường một: không chép object ca của PMS (object ấy có tên người tạo ca, người nhận).
// Logic thuần, không đọc DOM, không gọi mạng.

export const SHIFT_HANDOVER_PATH = "/api/extension/shift-handover";
/** Các ca đã gửi xong (chống trùng), mới nhất ở cuối. */
export const SENT_KEY = "shiftHandoverSent";
/** Hàng chờ gửi lại khi Hub lỗi tạm. */
export const QUEUE_KEY = "shiftHandoverQueue";
export const SENT_MAX = 50;
export const QUEUE_MAX = 20;
/** Lượt chờ quá lâu thì bỏ: Hub đã có số của các ca sau, số cũ không còn ai đọc. */
export const QUEUE_TTL_MS = 3 * 24 * 60 * 60 * 1000;

const CURRENCY = "VND";
const INT4_MAX = 2 ** 31 - 1;

/** Request PMS là lượt bấm Bàn giao: POST tới …/api/Shift/ShiftHandover trên PMS. */
export function isShiftHandoverRequest(url, method) {
  if (String(method ?? "").toUpperCase() !== "POST") return false;
  try {
    const u = new URL(url, "https://pms.ezcloudhotel.com/");
    return u.hostname === "pms.ezcloudhotel.com" && /\/api\/Shift\/ShiftHandover$/i.test(u.pathname);
  } catch {
    return false;
  }
}

/**
 * ezCloud báo bàn giao xong: HTTP 2xx và thân `{ Code: 0, … }` (khuôn chung `{ Code, Message, Data }` của API
 * ezCloud; 0 = thành công). Thân không đọc được ⇒ coi như chưa xong, không gửi gì.
 */
export function ezcloudSucceeded(status, responseText) {
  if (!(Number(status) >= 200 && Number(status) < 300)) return false;
  try {
    const json = typeof responseText === "string" ? JSON.parse(responseText) : responseText;
    return Boolean(json) && json.Code === 0;
  } catch {
    return false;
  }
}

/** Object ca trong thân request: ở gốc, hoặc bọc trong `Data` (chưa đo lượt bấm thật, đọc cả hai). */
function shiftOf(requestBody) {
  let root;
  try {
    root = typeof requestBody === "string" ? JSON.parse(requestBody) : requestBody;
  } catch {
    return null;
  }
  for (const c of [root, root?.Data, root?.data, root?.model]) {
    if (c && typeof c === "object" && Array.isArray(c.ListShiftDetailModels)) return c;
  }
  return null;
}

const positiveInt = (v) => (Number.isSafeInteger(v) && v > 0 && v <= INT4_MAX ? v : null);
const money = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * Thân tin gửi Hub, hoặc null khi thiếu thứ gì. `pageHotelId` = mã khách sạn đọc từ tiêu đề tab, chỉ dùng khi
 * object ca không mang `HotelId`.
 */
export function handoverReport({ requestBody, handedOverAt, extensionVersion, pageHotelId = "" }) {
  const shift = shiftOf(requestBody);
  if (!shift) return null;
  const ezShiftId = positiveInt(shift.ShiftId);
  const hotel = positiveInt(shift.HotelId) ?? positiveInt(Number(pageHotelId) || 0);
  if (!ezShiftId || !hotel) return null;
  const row = shift.ListShiftDetailModels.find((m) => m && String(m.MoneyName ?? "").trim().toUpperCase() === CURRENCY);
  if (!row) return null;
  const moneyInTheSafe = money(row.MoneyInTheSafe);
  const moneyNextShift = money(row.MoneyNextShift);
  const moneyAssignManagement = money(row.MoneyAssignManagement);
  if (moneyInTheSafe === null || moneyNextShift === null || moneyAssignManagement === null) return null;
  const number = Number.isSafeInteger(shift.ShiftNumber) && shift.ShiftNumber >= 0 ? shift.ShiftNumber : null;
  return {
    ezcloudHotelId: String(hotel),
    ezShiftId,
    ezShiftNumber: number,
    moneyInTheSafe,
    moneyNextShift,
    moneyAssignManagement,
    handedOverAt: String(handedOverAt),
    extensionVersion: String(extensionVersion),
  };
}

/** Thân tin nhận qua tin nhắn ⇒ dựng lại đúng tám trường; hình sai ⇒ null. */
export function cleanReport(r) {
  if (!r || typeof r !== "object") return null;
  if (!/^[1-9]\d{0,9}$/.test(String(r.ezcloudHotelId ?? "")) || !positiveInt(r.ezShiftId)) return null;
  const nums = [r.moneyInTheSafe, r.moneyNextShift, r.moneyAssignManagement].map(money);
  if (nums.includes(null) || typeof r.handedOverAt !== "string" || typeof r.extensionVersion !== "string") return null;
  return {
    ezcloudHotelId: String(r.ezcloudHotelId),
    ezShiftId: r.ezShiftId,
    ezShiftNumber: Number.isSafeInteger(r.ezShiftNumber) && r.ezShiftNumber >= 0 ? r.ezShiftNumber : null,
    moneyInTheSafe: nums[0],
    moneyNextShift: nums[1],
    moneyAssignManagement: nums[2],
    handedOverAt: r.handedOverAt,
    extensionVersion: r.extensionVersion,
  };
}

/** Khoá chống trùng: mỗi ca ezCloud (khách sạn × ca) gửi một lần. */
export const reportKey = (r) => `${r.ezcloudHotelId}:${r.ezShiftId}`;

/**
 * Thêm một lượt vào hàng chờ. Ca đã gửi xong hoặc đang chờ ⇒ hàng giữ nguyên (lễ tân bấm hai lần, hay PMS gửi
 * lại request, vẫn chỉ một lượt tới Hub).
 */
export function enqueue(queue, sent, report, now) {
  const key = reportKey(report);
  const q = Array.isArray(queue) ? queue : [];
  if ((Array.isArray(sent) ? sent : []).includes(key) || q.some((e) => e.key === key)) return q;
  return [...q, { key, report, queuedAt: now }].slice(-QUEUE_MAX);
}

/** Bỏ các lượt chờ quá `QUEUE_TTL_MS`. */
export function pruneQueue(queue, now) {
  return (Array.isArray(queue) ? queue : []).filter((e) => e && typeof e.key === "string" && now - Number(e.queuedAt) <= QUEUE_TTL_MS);
}

export function markSent(sent, key) {
  const list = (Array.isArray(sent) ? sent : []).filter((k) => k !== key);
  return [...list, key].slice(-SENT_MAX);
}

/** Lỗi mà gửi lại cũng không khác: thân sai, mã khách sạn chưa ghép, ngoài phạm vi. */
const DROP = new Set(["INVALID_BODY", "MISSING_HOTEL", "HOTEL_NOT_LINKED", "OUT_OF_SCOPE", "FORBIDDEN_ORIGIN", "STAGE_RESTRICTED", "BRANCH_NOT_FOUND"]);

/**
 * Lời đáp của Hub (dạng `hubFetch` trả) ⇒ việc với lượt ấy:
 *   `sent` — Hub đã nhận (kể cả `duplicate`); `drop` — bỏ, không gửi lại; `keep` — để trong hàng, gửi lại sau.
 * `out` = phiên Hub đã hết (để service worker ghi phiên). Hub cũ chưa có route (404 không kèm `error`) ⇒ `keep`,
 * không có lời báo nào cho khung quầy.
 */
export function settle(reply) {
  if (!reply || reply.netError) return { action: "keep" };
  const { status, json } = reply;
  if (status === 200 && json?.ok === true) return { action: "sent" };
  const code = typeof json?.error === "string" ? json.error : "";
  if (status === 401 || code === "NOT_SIGNED_IN" || reply.redirected) return { action: "keep", out: true };
  if (DROP.has(code)) return { action: "drop", code };
  return { action: "keep" };
}

export function shiftHandoverRequest(origin, report) {
  return {
    url: origin + SHIFT_HANDOVER_PATH,
    init: { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(report) },
  };
}
