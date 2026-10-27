import { CHANNEL_LABEL } from "./report.js";

export { CHANNEL_LABEL };

// Cấu hình của một bản cài (một khách sạn), lưu trong chrome.storage.local.

export const VERSION = "1.5.6";

export const CHANNELS = ["booking", "agoda", "trip", "expedia", "traveloka", "go2joy"];

export const DEFAULT_CONFIG = {
  hotel: "", // tên khách sạn khi Hub chưa cho biết chi nhánh của máy
  bookingHotelId: "", // bắt buộc nếu tài khoản Booking thấy nhiều chỗ nghỉ
  agodaPropertyId: "", // để trống ⇒ tự dò từ trang chủ Agoda
  expediaPropertyId: "", // để trống ⇒ tự dò khi tài khoản chỉ có một khách sạn
  // Expedia, Traveloka, Go2Joy tắt sẵn: không phải khách sạn nào cũng có, bật nhầm thì đèn báo cam mãi.
  enabled: { booking: true, agoda: true, trip: true, expedia: false, traveloka: false, go2joy: false },
  intervalHours: 6,
};

/**
 * Ô của bản cũ đã bỏ ⇒ bỏ khi đọc, lần lưu sau là mất hẳn khỏi bộ nhớ (`forgetSheet` lưu ngay lúc lên bản).
 * - `hubUrl`, `hubToken` (tới 1.0.0): từ 1.1.0 review lên Hub theo phiên đăng nhập (H-1233 a), máy không
 *   giữ token Hub nữa.
 * - `sheetUrl`, `secret` (tới 1.5.1): từ 1.5.2 review chỉ gửi Hub, không ghi Google Sheet nữa (YC-228,
 *   H-1924 a).
 */
export const DROPPED_KEYS = ["hubUrl", "hubToken", "sheetUrl", "secret"];

/** Cấu hình đã lưu ⇒ cấu hình đủ ô (thuần, test được). */
export function withDefaults(config) {
  const out = {
    ...DEFAULT_CONFIG,
    ...(config ?? {}),
    enabled: { ...DEFAULT_CONFIG.enabled, ...(config?.enabled ?? {}) },
  };
  for (const k of DROPPED_KEYS) delete out[k];
  return out;
}

export async function loadConfig() {
  const { config } = await chrome.storage.local.get("config");
  return withDefaults(config);
}

export async function saveConfig(config) {
  await chrome.storage.local.set({ config });
}

/** Trạng thái lượt quét gần nhất của từng kênh — để ô bật lên hiện ba đèn. */
export async function loadStatus() {
  const { status } = await chrome.storage.local.get("status");
  return status ?? {};
}

export async function saveChannelStatus(channel, value) {
  const status = await loadStatus();
  status[channel] = value;
  await chrome.storage.local.set({ status });
}

/** Mã máy: sinh một lần lúc cài, không đổi khi đổi tên khách sạn. Hub nhận diện máy quầy theo mã này. */
export async function getDeviceId() {
  const { deviceId } = await chrome.storage.local.get("deviceId");
  if (deviceId) return deviceId;
  const id = crypto.randomUUID();
  await chrome.storage.local.set({ deviceId: id });
  return id;
}

/**
 * Ghi một lỗi là "lỗi gần nhất" để ô bật lên hiện mã cho người dùng sao chép. Tới 1.5.1 lỗi còn xếp hàng
 * `pendingLogs` chờ gửi tab "Nhật ký lỗi" của Sheet; từ 1.5.2 không còn Sheet nên không xếp hàng nữa.
 * Lỗi từng kênh vẫn lên Hub theo lượt báo sống (quay/counter-heartbeat.js).
 */
export async function queueLog(entry) {
  await chrome.storage.local.set({ lastError: entry });
}

/**
 * Lên 1.5.2 (YC-228): dọn mọi thứ của Sheet review mà bản cũ để lại trong bộ nhớ máy — URL Sheet và mã bí
 * mật trong cấu hình, Sheet do Hub gửi trong bản cấu hình Hub đã lưu, hàng đợi nhật ký lỗi chờ gửi Sheet,
 * và dấu lỗi gửi Sheet (nó từng làm huy hiệu hiện "!" và Hub đếm REVIEW_SHEET_FAILED mãi). Chạy nhiều lần
 * không sao.
 */
export async function forgetSheet() {
  const got = await chrome.storage.local.get(["config", "hubCollect", "lastError"]);
  if (got.config && (Object.hasOwn(got.config, "sheetUrl") || Object.hasOwn(got.config, "secret"))) {
    await saveConfig(withDefaults(got.config));
  }
  if (got.hubCollect && Object.hasOwn(got.hubCollect, "reviewSheet")) {
    const { reviewSheet: _, ...rest } = got.hubCollect;
    await chrome.storage.local.set({ hubCollect: rest });
  }
  const drop = ["pendingLogs"];
  if (got.lastError?.stage === "gửi Sheet") drop.push("lastError");
  await chrome.storage.local.remove(drop);
}
