// Booking OTA và Khoá G2J: logic thuần, chuyển nguyên từ userscript EZCloud OTA Sync 3.2.0
// (ezcloud-ota-booking-sync/userscript/ezcloud-ota-sync.user.js). Gọi đúng API Apps Script mà
// userscript đang gọi; Apps Script không đổi.
//
// Tệp này không gọi mạng, không đọc chrome.*: service worker gọi mạng, khung trên PMS vẽ.

import { APPS_SCRIPT_URL_RE } from "../env.js";

/** Số ngày của bảng khoá G2J (userscript: BOARD_DAYS). */
export const BOARD_DAYS = 14;
/** Số booking mỗi lượt đọc gần đây hoặc tìm (userscript gửi limit=10). */
export const LIST_LIMIT = 10;
/** Khung đang mở thì tự làm mới mỗi 2 phút (userscript: AUTO_REFRESH_MS). */
export const AUTO_REFRESH_MS = 2 * 60 * 1000;
/** Thời gian chờ lời đáp Apps Script (userscript: 90 giây cho GET, 60 giây cho POST đẩy token). */
export const GET_TIMEOUT_MS = 90_000;
export const POST_TIMEOUT_MS = 60_000;

// ---------- Đẩy token ezCloud / Go2Joy về Apps Script (18_TokenPush.js) ----------

/** Chờ 3 giây gom các request liên tiếp mang cùng token (userscript: PUSH_DEBOUNCE_MS). */
export const PUSH_DEBOUNCE_MS = 3000;
/** Go2Joy: chờ tối đa 15 giây cho một request có hotelSn (userscript: GO2JOY_WAIT_FOR_HOTELSN_MS). */
export const GO2JOY_WAIT_FOR_HOTELSN_MS = 15_000;
/** Không thấy request nào mang token sau 10 giây ⇒ đọc JWT trong bộ nhớ trang (userscript: STORAGE_FALLBACK_MS). */
export const STORAGE_FALLBACK_MS = 10_000;
/** Token đã gửi thì sau 10 phút mới gửi lại (userscript: RESEND_MS). */
export const RESEND_MS = 10 * 60 * 1000;
/** Bộ nhớ token đã gửi giữ tối đa 20 mục (userscript: writePushed). */
export const MEMO_LIMIT = 20;
/** Lỗi đáng thử lại ở request sau, không ghi nhớ token là hỏng (userscript: RETRYABLE). */
export const RETRYABLE = /Đang bận|Chưa biết hotelSn/;

export const TOKEN_KINDS = {
  ezcloud: { label: "ezCloud", host: "pms.ezcloudhotel.com" },
  go2joy: { label: "Go2Joy", host: "ha.go2joy.vn" },
};

/** Request của trang có mang token đáng gửi không (userscript: CAPTURE[host].isApi). */
export function isTokenApi(kind, rawUrl, base) {
  let u;
  try {
    u = new URL(rawUrl, base);
  } catch {
    return false;
  }
  if (kind === "ezcloud") return u.hostname === "pms.ezcloudhotel.com" && u.pathname.startsWith("/api/");
  if (kind === "go2joy") return u.hostname === "api-ha.go2joy.vn";
  return false;
}

/** Lấy token từ header Authorization "Bearer …"; không có ⇒ "". */
export function bearerOf(auth) {
  const m = String(auth ?? "").match(/^Bearer\s+(\S+)/i);
  return m ? m[1] : "";
}

/** hotelSn của Go2Joy: từ tham số URL, không có thì từ thân request JSON. */
export function hotelSnOf(rawUrl, base, body) {
  let sn = 0;
  try {
    sn = Number(new URL(rawUrl, base).searchParams.get("hotelSn")) || 0;
  } catch {}
  if (!sn && typeof body === "string") {
    const m = body.match(/"hotelSn"\s*:\s*"?(\d+)/);
    if (m) sn = Number(m[1]);
  }
  return sn;
}

/** JWT trong localStorage/sessionStorage của trang; khoá có chữ access/token được xét trước. */
export function findJwtIn(stores) {
  const jwt = /eyJ[\w-]+\.[\w-]+\.[\w-]+/;
  const score = (key) => (/access/i.test(key) ? 2 : 0) + (/token/i.test(key) ? 1 : 0);
  for (const store of stores) {
    const keys = Object.keys(store).sort((a, b) => score(b) - score(a));
    for (const key of keys) {
      const m = String(store[key] ?? "").match(jwt);
      if (m) return m[0];
    }
  }
  return "";
}

/** Phần payload của JWT, đã giải base64url; hỏng ⇒ null. Không kiểm chữ ký: chỉ để đọc mã khách sạn. */
export function jwtPayload(token) {
  const part = String(token ?? "").split(".")[1];
  if (!part) return null;
  try {
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
    const json = new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
    const obj = JSON.parse(json);
    return obj && typeof obj === "object" ? obj : null;
  } catch {
    return null;
  }
}

/**
 * Mã khách sạn ezCloud của PMS đang mở: claim HotelId trong JWT mà PMS gửi kèm mỗi request.
 * Tên claim khớp lỏng (`HotelId`, `hotel_id`, `…/hotelid`). Trả chuỗi số; không thấy ⇒ "".
 */
export function ezcloudHotelIdOf(token) {
  const p = jwtPayload(token);
  if (!p) return "";
  for (const [key, value] of Object.entries(p)) {
    if (!/(^|[/_.:])hotel_?id$/i.test(key)) continue;
    const v = String(value ?? "").trim();
    if (/^\d+$/.test(v)) return v;
  }
  return "";
}

/** Hàm băm ngắn cho khoá bộ nhớ (userscript: hash). Không lưu token thật. */
export function hash(text) {
  let h = 5381;
  for (let i = 0; i < text.length; i += 1) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function memoKey(kind, webAppUrl, token) {
  return kind + ":" + hash(webAppUrl + "|" + token);
}

/** Token này đã gửi (lưu hoặc bị từ chối) trong 10 phút qua ⇒ không gửi lại. */
export function isRemembered(memo, key, now) {
  const entry = memo?.[key];
  return Boolean(entry) && now - entry.at < RESEND_MS;
}

/** Câu lỗi lần trước của token này; null khi lần trước không bị từ chối. */
export function lastErrorOf(memo, key) {
  const entry = memo?.[key];
  return entry && entry.status === "rejected" ? entry.error || "" : null;
}

/** Ghi nhớ kết quả, giữ tối đa 20 mục mới nhất. Trả bản mới, không sửa bản cũ. */
export function remember(memo, key, status, error, now) {
  const next = { ...(memo ?? {}) };
  delete next[key];
  next[key] = { status, at: now, error: error || "" };
  const keys = Object.keys(next);
  for (const k of keys.slice(0, Math.max(0, keys.length - MEMO_LIMIT))) delete next[k];
  return next;
}

/** Thân POST đẩy token (18_TokenPush.js). */
export function pushTokenBody({ kind, token, hotelSn, pushKey }) {
  return JSON.stringify({ action: "pushToken", kind, token, hotelSn: hotelSn || "", key: pushKey });
}

/**
 * Đọc lời đáp đẩy token. `outcome`:
 * saved · unchanged · pending (token chạy được nhưng chưa ai xác nhận là của khách sạn này) ·
 * rejected (ghi nhớ, không gửi lại 10 phút) · retry (lỗi tạm, gửi lại ở request sau) · bad-reply.
 * `codeRejected` = Apps Script từ chối chính mã kết nối (pushKey sai) ⇒ báo Hub.
 */
export function parsePushReply(text) {
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  if (!json || typeof json !== "object") return { outcome: "bad-reply", message: "Phản hồi không phải JSON", hotel: "" };
  const hotel = typeof json.hotel === "string" ? json.hotel : "";
  if (json.ok) {
    const status = json.result?.status;
    const message = String(json.result?.message ?? "");
    const outcome = status === "SAVED" ? "saved" : status === "PENDING" ? "pending" : "unchanged";
    return { outcome, message, hotel };
  }
  const error = String(json.error ?? "");
  if (RETRYABLE.test(error)) return { outcome: "retry", message: error, hotel };
  return { outcome: "rejected", message: error, hotel, codeRejected: isRejectedCodeError(error) };
}

// ---------- Đọc booking, bảng khoá, Khoá G2J (11_StatusApiRecentPatch.js) ----------

/** URL Web App có đúng mẫu Apps Script không. Sai mẫu ⇒ không gọi. */
export function isAppsScriptUrl(url) {
  return APPS_SCRIPT_URL_RE.test(String(url ?? ""));
}

/** URL GET tới Web App, kèm token API nếu có (userscript: api()). */
export function apiUrl(webAppUrl, params, apiToken) {
  const q = new URLSearchParams({ ...params, ...(apiToken ? { token: apiToken } : {}) });
  return webAppUrl + (webAppUrl.includes("?") ? "&" : "?") + q.toString();
}

export const recentParams = () => ({ recent: "1", limit: String(LIST_LIMIT) });
export const searchParams = (q) => ({ q, limit: String(LIST_LIMIT) });
export const boardParams = () => ({ action: "board", days: String(BOARD_DAYS) });
export const lockParams = (sourceKey, confirmPaid) => ({ action: "lockG2J", sourceKey, confirmPaid: confirmPaid ? "1" : "" });

export class ApiError extends Error {
  /** kind: "rejected" (Apps Script từ chối mã) · "api" (Apps Script báo lỗi khác) · "not-json" · "net" · "timeout" · "no-code" */
  constructor(kind, message, hotel = "") {
    super(message);
    this.kind = kind;
    this.hotel = hotel;
  }
}

/**
 * Câu lỗi của Apps Script có nghĩa là mã kết nối bị từ chối không.
 * GET: "Invalid or missing OTA status API token." (11_StatusApiRecentPatch.js).
 * POST: "Sai mã kết nối. …" (18_TokenPush.js).
 */
export function isRejectedCodeError(message) {
  const m = String(message ?? "");
  return /Invalid or missing OTA status API token/i.test(m) || /^Sai mã kết nối/.test(m);
}

/** Đọc lời đáp GET. Trả `{ result, hotel }`; lỗi ⇒ ném ApiError. */
export function parseApiReply(text) {
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ApiError("not-json", 'Phản hồi không phải JSON. Kiểm tra Web App URL và quyền truy cập "Anyone".');
  }
  const hotel = typeof json?.hotel === "string" ? json.hotel : "";
  if (!json?.ok) {
    const msg = String(json?.error || "API lỗi");
    throw new ApiError(isRejectedCodeError(msg) ? "rejected" : "api", msg, hotel);
  }
  return { result: json.result, hotel };
}

/** Booking có lỗi: EZ ERROR, hoặc G2J ERROR/SKIPPED (userscript: loadRecent). */
export function hasIssue(m) {
  return m?.ezCloud?.status === "ERROR" || m?.go2Joy?.lockStatus === "ERROR" || m?.go2Joy?.lockStatus === "SKIPPED";
}

export function countIssues(matches) {
  return (matches ?? []).filter(hasIssue).length;
}

/** Hiện nút Khoá G2J: đã tạo trên EZCloud mà G2J chưa khoá / chưa đồng bộ. */
export function canLock(m) {
  return m?.ezCloud?.status === "CREATED" && m?.go2Joy?.lockStatus !== "LOCKED" && m?.go2Joy?.lockStatus !== "SYNCED";
}

/** Câu hỏi xác nhận trước khi khoá, và có gửi confirmPaid=1 không (userscript: lockG2J). */
export function lockConfirm(m) {
  const unpaid = String(m?.source ?? "").toLowerCase() === "urbanb" && /chưa/i.test(String(m?.paymentStatus ?? ""));
  return unpaid
    ? { text: 'Booking UrbanB đang "Chưa thanh toán". Xác nhận khách đã thanh toán và khoá G2J?', confirmPaid: true }
    : { text: "Khoá loại phòng này trên Go2Joy cho khung giờ của booking?", confirmPaid: false };
}

/** Kết quả Khoá G2J thành dải trong tab (không phải thông báo nổi). */
export function lockOutcome(result) {
  const r = result?.lockResult ?? {};
  return { ok: r.status === "LOCKED", text: `G2J ${r.status ?? "?"}: ${r.message ?? ""}`.trim() };
}

/** Lớp màu của chip trạng thái (userscript: chip). */
export function chipClass(status) {
  const s = String(status || "");
  if (/CREATED|LOCKED|SYNCED|OK/.test(s)) return "ok";
  if (/ERROR/.test(s)) return "err";
  if (/SKIPPED|PARSED/.test(s)) return "warn";
  if (/AVAILABLE/.test(s)) return "info";
  return "none";
}

/** Booking cần xử lý đứng đầu; giữ thứ tự Apps Script trả trong mỗi nhóm. */
export function sortForCounter(matches) {
  const list = [...(matches ?? [])];
  return [...list.filter(hasIssue), ...list.filter((m) => !hasIssue(m))];
}

export function fmtVnd(v) {
  const n = Number(v);
  return n ? n.toLocaleString("vi-VN") + "đ" : "";
}

export function localDate(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

export function weekday(day) {
  return ["CN", "T2", "T3", "T4", "T5", "T6", "T7"][new Date(day + "T00:00:00").getDay()];
}

/** Khoá trên HA Go2Joy có phủ ngày này không (userscript: haCoversDay). */
export function haCoversDay(l, day) {
  if (l.lockCategory === "hourly") return l.startDate === day;
  if (l.lockCategory === "overnight") return l.endDate > l.startDate ? day >= l.startDate && day < l.endDate : day === l.startDate;
  return day >= l.startDate && day <= l.endDate;
}

/** Booking OTA còn phòng, chưa khoá, có phủ ngày này không (userscript: coversDay). */
export function coversDay(lock, day) {
  const ci = String(lock.checkIn ?? "").slice(0, 10);
  const co = String(lock.checkOut ?? "").slice(0, 10);
  if (lock.lockCategory === "hourly") return ci === day;
  if (lock.lockCategory === "daily") return ci === day;
  return day >= ci && (co > ci ? day < co : day === ci);
}

const CATEGORY_TEXT = { hourly: "theo giờ", overnight: "qua đêm", daily: "theo ngày" };

/**
 * Mô hình bảng khoá 14 ngày (userscript: renderBoard), chưa có HTML.
 * `occ.ok === false` ⇒ `{ error }`.
 */
export function boardModel(occ, locksRes, today) {
  if (!occ?.ok) return { error: `Không đọc được timeline EZCloud: ${occ?.message ?? ""}` };
  const haLocks = locksRes?.haLocks ?? [];
  const haByType = {};
  for (const l of haLocks) (haByType[l.ezRoomTypeId] ??= []).push(l);
  const availByType = {};
  for (const l of (locksRes?.locks ?? []).filter((x) => x.status === "AVAILABLE")) (availByType[l.ezRoomTypeId] ??= []).push(l);

  const days = occ.days.map((d) => ({ day: d, label: `${d.slice(8)}/${d.slice(5, 7)}`, weekday: weekday(d), today: d === today }));
  const rows = occ.roomTypes.map((t) => ({
    name: t.name,
    total: t.total,
    rooms: (t.rooms ?? []).join(", "),
    cells: occ.days.map((d, i) => {
      const c = t.perDay[i] ?? { free: null, total: t.total, freeRooms: [] };
      const cls = c.free === null ? "fn" : c.free === 0 ? "f0" : c.free === 1 ? "f1" : "fx";
      const dayHa = (haByType[t.roomTypeId] ?? []).filter((l) => haCoversDay(l, d));
      const dayAvail = (availByType[t.roomTypeId] ?? []).filter((l) => coversDay(l, d));
      const icons = dayHa.map((l) => (CATEGORY_TEXT[l.lockCategory] ? l.lockCategory : "lock")).concat(dayAvail.map(() => "avail"));
      const free = c.free === null ? "không rõ" : `trống ${c.free}/${c.total}${(c.freeRooms ?? []).length ? " (" + c.freeRooms.join(", ") + ")" : ""}`;
      const tip = [`${t.name} ${d}: ${free}`]
        .concat(
          dayHa.map(
            (l) =>
              `KHOÁ G2J ${CATEGORY_TEXT[l.lockCategory] ?? ""} ${l.lockCategory === "hourly" ? l.startTime + "-" + l.endTime : l.startDate + " đến " + l.endDate} | tạo ${l.createTime} bởi ${l.createBy}`,
          ),
        )
        .concat(dayAvail.map((l) => `CÒN PHÒNG, chưa khoá: ${l.source} ${l.bookingNumber} ${l.guestName} | ${l.checkIn} đến ${l.checkOut}`))
        .join("\n");
      return { cls, n: c.free === null ? "?" : String(c.free), icons, tip };
    }),
  }));
  const unmapped = haLocks.filter((l) => !l.ezRoomTypeId);
  const warn = unmapped.length
    ? `${unmapped.length} khoá Go2Joy không khớp loại phòng EZCloud: ${unmapped.map((l) => l.roomTypeName + " " + l.startDate).join(", ")}`
    : "";
  const meta =
    "Số trong ô = phòng trống qua đêm (14:00 đến 12:00 hôm sau). " +
    (locksRes?.haOk ? `${haLocks.length} khoá đang có trên Go2Joy trong ${BOARD_DAYS} ngày` : `Không đọc được khoá từ Go2Joy: ${locksRes?.haMessage ?? ""}`) +
    `, ${locksRes?.count ?? 0} booking OTA đã xử lý. Cập nhật ${occ.generatedAt ?? ""}.`;
  return { days, rows, warn, meta };
}
