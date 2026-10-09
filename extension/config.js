import { CHANNEL_LABEL, pushLimited } from "./report.js";

export { CHANNEL_LABEL };

// Cấu hình của một bản cài (một khách sạn), lưu trong chrome.storage.local.

export const VERSION = "0.8.1";

export const CHANNELS = ["booking", "agoda", "trip", "expedia", "traveloka", "go2joy"];

export const DEFAULT_CONFIG = {
  sheetUrl: "", // URL Web App của Apps Script (…/exec)
  secret: "", // chuỗi bí mật in ra khi chạy setup() trong Apps Script
  hotel: "", // tên khách sạn, ghi vào cột "Khách sạn"
  hubUrl: "", // gốc Hub UrbanB, ví dụ https://hub.urbanb.vn; để trống ⇒ không gửi Hub (hub.js)
  hubToken: "", // token nhận review của Hub; chỉ đi trong header Authorization
  bookingHotelId: "", // bắt buộc nếu tài khoản Booking thấy nhiều chỗ nghỉ
  agodaPropertyId: "", // để trống ⇒ tự dò từ trang chủ Agoda
  expediaPropertyId: "", // để trống ⇒ tự dò khi tài khoản chỉ có một khách sạn
  // Expedia, Traveloka, Go2Joy tắt sẵn: không phải khách sạn nào cũng có, bật nhầm thì đèn báo cam mãi.
  enabled: { booking: true, agoda: true, trip: true, expedia: false, traveloka: false, go2joy: false },
  intervalHours: 6,
};

export async function loadConfig() {
  const { config } = await chrome.storage.local.get("config");
  return {
    ...DEFAULT_CONFIG,
    ...(config ?? {}),
    enabled: { ...DEFAULT_CONFIG.enabled, ...(config?.enabled ?? {}) },
  };
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

/**
 * Mã máy: sinh một lần lúc cài, không đổi khi đổi tên khách sạn.
 * Sheet dùng nó để phát hiện hai máy khai cùng một tên, hoặc một máy đã đổi tên.
 */
export async function getDeviceId() {
  const { deviceId } = await chrome.storage.local.get("deviceId");
  if (deviceId) return deviceId;
  const id = crypto.randomUUID();
  await chrome.storage.local.set({ deviceId: id });
  return id;
}

/** Lỗi chờ gửi về tab "Nhật ký lỗi"; giữ lại khi gửi Sheet hỏng để gửi kèm lượt sau. */
export async function loadPendingLogs() {
  const { pendingLogs } = await chrome.storage.local.get("pendingLogs");
  return pendingLogs ?? [];
}

/** Xếp hàng một lỗi, và nhớ nó là "lỗi gần nhất" để ô bật lên hiện mã cho người dùng sao chép. */
export async function queueLog(entry) {
  await chrome.storage.local.set({ pendingLogs: pushLimited(await loadPendingLogs(), entry), lastError: entry });
}

export async function loadLastError() {
  const { lastError } = await chrome.storage.local.get("lastError");
  return lastError ?? null;
}

/** Gửi Sheet được lại ⇒ lỗi gửi Sheet cũ không còn đúng, thôi hiện. */
export async function clearSheetError() {
  const last = await loadLastError();
  if (last?.stage === "gửi Sheet") await chrome.storage.local.remove("lastError");
}

export async function dropLogs(ids) {
  const sent = new Set(ids);
  const left = (await loadPendingLogs()).filter((l) => !sent.has(l.id));
  await chrome.storage.local.set({ pendingLogs: left });
}
