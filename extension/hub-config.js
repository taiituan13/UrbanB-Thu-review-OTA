// Cấu hình thu review đặt trên Hub (YC-152 mục 2 · H-1348 a · F8 của YC-120): một cấu hình cho cả chuỗi,
// Quản trị hệ thống sửa ở màn Kết nối › Extension máy quầy. Phần thuần ở trên, phần đọc bộ nhớ ở cuối.
//
// Hợp đồng (repo UrbanB, chỉ đọc: src/app/api/extension/connection/route.ts, counter-settings.rules.ts):
// mọi lời đáp 200 của GET /api/extension/connection (ezcloudHotelId, branchId, scope=mine) có thể kèm
//   settings: { toastSeconds }                       thời gian tự ẩn thông báo nổi, 1–120 giây
//   reviewCollect: { enabled: { booking, agoda, trip, expedia, traveloka, go2joy }, intervalHours }
// `enabled` mang đủ sáu khoá, kênh tắt là false: không trộn với mặc định của máy. `intervalHours` 1–168.
// Hub chưa có dòng cấu hình ⇒ vắng cả hai trường ⇒ máy dùng mặc định của extension.

import { CHANNELS, DEFAULT_CONFIG, loadConfig } from "./config.js";

/** Cận kỹ thuật, khớp CHECK của Hub (counter_extension_settings_*_range). Ngoài cận ⇒ coi như vắng. */
export const INTERVAL_HOURS_RANGE = { min: 1, max: 168 };
export const TOAST_SECONDS_RANGE = { min: 1, max: 120 };

/** Khoá lưu bản cấu hình Hub gần nhất (chrome.storage.local). */
export const HUB_COLLECT_KEY = "hubCollect";

const intIn = (v, r) => (Number.isInteger(v) && v >= r.min && v <= r.max ? v : undefined);

/**
 * Lời đáp `connection` ⇒ `{ enabled?, intervalHours?, toastSeconds? }`, chỉ các trường Hub gửi đúng
 * dạng. `enabled`: khoá vắng hoặc không phải boolean ⇒ false (Hub luôn gửi đủ; thiếu là tắt, không
 * rơi về mặc định của máy).
 */
export function parseHubSettings(json) {
  const out = {};
  const rc = json?.reviewCollect;
  if (rc && typeof rc === "object") {
    if (rc.enabled && typeof rc.enabled === "object" && !Array.isArray(rc.enabled)) {
      out.enabled = Object.fromEntries(CHANNELS.map((ch) => [ch, rc.enabled[ch] === true]));
    }
    const h = intIn(rc.intervalHours, INTERVAL_HOURS_RANGE);
    if (h !== undefined) out.intervalHours = h;
  }
  const t = intIn(json?.settings?.toastSeconds, TOAST_SECONDS_RANGE);
  if (t !== undefined) out.toastSeconds = t;
  return out;
}

/**
 * Kênh quét và chu kỳ thực dùng. Hub có trường nào thì trường ấy theo Hub.
 * Hub vắng: kênh theo cấu hình của máy (mã cài đặt hoặc ô Kênh quét), chu kỳ theo mặc định của
 * extension (ô nhập chu kỳ tại máy đã bỏ, số cũ trong bộ nhớ không dùng nữa).
 */
export function effectiveCollect(cfg, hub) {
  const fromHub = { enabled: Boolean(hub?.enabled), intervalHours: hub?.intervalHours !== undefined };
  return {
    enabled: fromHub.enabled ? { ...hub.enabled } : { ...DEFAULT_CONFIG.enabled, ...(cfg?.enabled ?? {}) },
    intervalHours: fromHub.intervalHours ? hub.intervalHours : DEFAULT_CONFIG.intervalHours,
    fromHub,
  };
}

/** Chu kỳ báo thức của lượt tự quét, tính bằng phút; không dày hơn 30 phút. */
export function alarmMinutes(intervalHours) {
  return Math.max(30, Math.round(Number(intervalHours || DEFAULT_CONFIG.intervalHours) * 60));
}

/** Chữ dưới nút Quét: chu kỳ và nguồn của nó. */
export function scheduleText(eff) {
  const src = eff.fromHub.intervalHours ? "theo cấu hình trên Hub" : "mặc định, chưa nhận cấu hình từ Hub";
  return `Thu review tự quét mỗi ${eff.intervalHours} giờ (${src}).`;
}

// ---------- Bộ nhớ ----------

export async function loadHubCollect() {
  const { [HUB_COLLECT_KEY]: v } = await chrome.storage.local.get(HUB_COLLECT_KEY);
  return v ?? null;
}

/** Cấu hình máy với kênh và chu kỳ đã áp cấu hình Hub. `collect` cho biết trường nào theo Hub. */
export async function loadEffectiveConfig() {
  const [cfg, hub] = await Promise.all([loadConfig(), loadHubCollect()]);
  const collect = effectiveCollect(cfg, hub);
  return { ...cfg, enabled: collect.enabled, intervalHours: collect.intervalHours, collect };
}
