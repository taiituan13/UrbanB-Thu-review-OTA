// Cấu hình của một bản cài (một khách sạn), lưu trong chrome.storage.local.

export const VERSION = "0.2.0";

export const CHANNELS = ["booking", "agoda", "trip", "expedia", "traveloka"];

export const CHANNEL_LABEL = { booking: "Booking", agoda: "Agoda", trip: "Trip", expedia: "Expedia", traveloka: "Traveloka" };

export const DEFAULT_CONFIG = {
  sheetUrl: "", // URL Web App của Apps Script (…/exec)
  secret: "", // chuỗi bí mật in ra khi chạy setup() trong Apps Script
  hotel: "", // tên khách sạn, ghi vào cột "Khách sạn"
  bookingHotelId: "", // bắt buộc nếu tài khoản Booking thấy nhiều chỗ nghỉ
  agodaPropertyId: "", // để trống ⇒ tự dò từ trang chủ Agoda
  expediaPropertyId: "", // để trống ⇒ khách sạn đang chọn trên Expedia
  // Expedia và Traveloka tắt sẵn: không phải khách sạn nào cũng có, bật nhầm thì đèn báo cam mãi.
  enabled: { booking: true, agoda: true, trip: true, expedia: false, traveloka: false },
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
