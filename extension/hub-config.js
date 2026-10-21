// Cấu hình thu review đặt trên Hub (YC-152 mục 2 · H-1348 a · F8 của YC-120): một cấu hình cho cả chuỗi,
// Quản trị hệ thống sửa ở màn Kết nối › Extension máy quầy. Phần thuần ở trên, phần đọc bộ nhớ ở cuối.
//
// Hợp đồng (repo UrbanB, chỉ đọc: src/app/api/extension/connection/route.ts, counter-settings.rules.ts):
// mọi lời đáp 200 của GET /api/extension/connection (ezcloudHotelId, branchId, scope=mine) có thể kèm
//   settings: { toastSeconds }                       thời gian tự ẩn thông báo nổi, 1–120 giây
//   reviewCollect: { enabled: { booking, agoda, trip, expedia, traveloka, go2joy }, intervalHours }
// `enabled` mang đủ sáu khoá, kênh tắt là false: không trộn với mặc định của máy. `intervalHours` 1–168.
// Hub chưa có dòng cấu hình ⇒ vắng cả hai trường ⇒ máy dùng mặc định của extension.
//
// YC-156 · H-1527 a: lời đáp còn mang `reviewSheet: { sheetUrl, secret, updatedAt } | null` (một Sheet thu
// review cho cả chuỗi, repo UrbanB connection-codes.ts), và mỗi cơ sở của `scope=mine` mang
// `reviewIds: { booking, agoda, expedia }` (quay/hub-quay.js parseMine). Hub có Sheet ⇒ Hub thắng: URL Sheet,
// mã bí mật theo Hub, tên khách sạn = tên cơ sở đang dùng, mã chỗ nghỉ theo cơ sở (ô nào null thì như cũ).
// Hub vắng hoặc null ⇒ máy chạy bằng cấu hình cũ trong bộ nhớ (mã cài đặt URB1 hoặc ô nhập tay của bản trước).

import { CHANNELS, DEFAULT_CONFIG, loadConfig } from "./config.js";
import { APPS_SCRIPT_URL_RE } from "./env.js";
import { pickBranch } from "./quay/hub-quay.js";

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
  const sheet = parseReviewSheet(json?.reviewSheet);
  if (sheet) out.reviewSheet = sheet;
  return out;
}

/**
 * `reviewSheet` của Hub ⇒ `{ sheetUrl, secret, updatedAt }`, hoặc null khi Hub nói chưa có, vắng trường,
 * hay sai dạng: URL không phải Web App Apps Script (cùng luật Hub dùng khi lưu), mã bí mật rỗng.
 * Máy gửi mã bí mật và review tới URL này, nên URL lạ thì coi như Hub không gửi.
 */
export function parseReviewSheet(raw) {
  if (!raw || typeof raw !== "object") return null;
  const sheetUrl = typeof raw.sheetUrl === "string" ? raw.sheetUrl.trim() : "";
  const secret = typeof raw.secret === "string" ? raw.secret.trim() : "";
  if (!APPS_SCRIPT_URL_RE.test(sheetUrl) || !secret) return null;
  return { sheetUrl, secret, updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : null };
}

/**
 * Cấu hình thu review thực dùng (H-1527 a). `cfg` = cấu hình máy, `hub` = bản cấu hình Hub đã lưu,
 * `branches`/`chosenId` = danh sách cơ sở scope=mine và cơ sở đã chọn trong popup.
 * - Hub có `reviewSheet` ⇒ URL Sheet + mã bí mật theo Hub; tên khách sạn = tên cơ sở đang dùng (chưa xác
 *   định được cơ sở ⇒ tên cũ trong bộ nhớ); mã Booking/Agoda/Expedia theo cơ sở, ô null ⇒ mã cũ, không có ⇒ tự dò.
 * - Hub không có ⇒ nguyên cấu hình máy.
 * `fromHub` nói trường nào theo Hub; `branchState` = trạng thái chọn cơ sở (pickBranch); `hubSeen` = đã
 * nhận lời đáp Hub nào chưa (để câu nhắc nói đúng: chưa đăng nhập hay Hub chưa có cấu hình).
 */
export function effectiveReview(cfg, hub, branches, chosenId) {
  const c = cfg ?? {};
  const sheet = hub?.reviewSheet ?? null;
  const pick = pickBranch(branches ?? null, chosenId ?? "");
  const branch = sheet ? pick.branch ?? null : null;
  const ids = branch?.reviewIds ?? {};
  const own = (v) => String(v ?? "").trim();
  return {
    sheetUrl: sheet ? sheet.sheetUrl : own(c.sheetUrl),
    secret: sheet ? sheet.secret : own(c.secret),
    hotel: branch?.name || own(c.hotel),
    bookingHotelId: ids.booking || own(c.bookingHotelId),
    agodaPropertyId: ids.agoda || own(c.agodaPropertyId),
    expediaPropertyId: ids.expedia || own(c.expediaPropertyId),
    fromHub: {
      sheet: Boolean(sheet),
      hotel: Boolean(branch?.name),
      booking: Boolean(ids.booking),
      agoda: Boolean(ids.agoda),
      expedia: Boolean(ids.expedia),
    },
    branchState: pick.state,
    hubSeen: Boolean(hub?.at),
  };
}

/** Thu review chưa chạy được thì vì sao (một câu cho lễ tân); đủ cấu hình ⇒ null. */
export function reviewMissingText(review) {
  const r = review ?? {};
  if (!r.sheetUrl || !r.secret) {
    return r.hubSeen
      ? "Hub chưa có cấu hình thu review. Báo Quản trị hệ thống điền Sheet thu review ở màn Kết nối › Extension máy quầy trên Hub."
      : "Chưa nhận cấu hình thu review từ Hub. Đăng nhập Hub rồi mở màn Cài extension trên Hub.";
  }
  if (!r.hotel) {
    if (r.branchState === "ask") return "Chưa biết tên khách sạn: tài khoản Hub có nhiều cơ sở. Bấm icon UrbanB trên thanh Chrome, chọn cơ sở của máy này.";
    return "Chưa biết tên khách sạn: đăng nhập Hub bằng tài khoản của cơ sở (mở màn Cài extension trên Hub).";
  }
  return null;
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

/** Khoá danh sách cơ sở scope=mine và cơ sở đã chọn (quay/sw.js ghi). */
export const MINE_KEY = "quayMine";
export const BRANCH_KEY = "quayBranchId";

/**
 * Cấu hình máy đã áp cấu hình Hub: kênh, chu kỳ (`collect`) và Sheet, tên khách sạn, mã chỗ nghỉ (`review`).
 * `collect.fromHub` / `review.fromHub` cho biết trường nào theo Hub.
 */
export async function loadEffectiveConfig() {
  const [cfg, hub, stored] = await Promise.all([loadConfig(), loadHubCollect(), chrome.storage.local.get([MINE_KEY, BRANCH_KEY])]);
  const collect = effectiveCollect(cfg, hub);
  const review = effectiveReview(cfg, hub, stored[MINE_KEY]?.branches ?? null, stored[BRANCH_KEY] ?? "");
  const { fromHub: _, branchState: __, hubSeen: ___, ...fields } = review;
  return { ...cfg, ...fields, enabled: collect.enabled, intervalHours: collect.intervalHours, collect, review };
}
