// Cấu hình thu review đặt trên Hub (YC-152 mục 2 · H-1348 a · F8 của YC-120): một cấu hình cho cả chuỗi,
// Quản trị hệ thống sửa ở màn Kết nối › tab Mã kết nối Booking OTA › khối Extension máy quầy (H-1904 a). Phần thuần ở trên, phần đọc bộ nhớ ở cuối.
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
//
// YC-156 L6: Hub mới kèm thêm `reviewSheetReason: "NOT_CONFIGURED" | "NO_BRANCH_ACCESS" | null` cạnh
// `reviewSheet` (repo UrbanB connection-code.rules.ts reviewSheetReasonOf). `NO_BRANCH_ACCESS` = tài khoản
// đang đăng nhập không lấy được cấu hình của chi nhánh nào, nên Hub không gửi Sheet dù Hub có thể đã có.
// Hub cũ không có trường ⇒ máy nói như bản trước.
//
// YC-156 L5 · H-1903 b: máy chưa có Sheet thu review mà đã nhận lời đáp Hub thì vẫn quét và vẫn gửi review
// lên Hub, chỉ bỏ phần ghi Sheet (`reviewSendsSheet`, `sheetSkipText`).

import { helpText } from "./report.js";
import { CHANNELS, DEFAULT_CONFIG, loadConfig } from "./config.js";
import { APPS_SCRIPT_URL_RE } from "./env.js";
import { pickBranch } from "./quay/hub-quay.js";

/**
 * Chỉ đường trên Hub (YC-156 L2 · H-1904 a): tên thật của màn, tab và khối, đo trên Hub. Màn Kết nối có tab
 * đầu "Mã kết nối Booking OTA"; trong tab ấy khối "Sheet review" giữ Sheet thu review, khối "Extension máy
 * quầy" giữ kênh quét và chu kỳ. Câu cũ chỉ tới một "phần" và một "bảng tính" không có trên Hub.
 */
export const HUB_SHEET_PLACE = "màn Kết nối, tab Mã kết nối Booking OTA, khối Sheet review";
export const HUB_COUNTER_PLACE = "màn Kết nối, tab Mã kết nối Booking OTA, khối Extension máy quầy";
const SHEET_PLACE_STEP = `Nhắn Quản trị hệ thống nhập Sheet review trên Hub: ${HUB_SHEET_PLACE}.`;

/** Cận kỹ thuật, khớp CHECK của Hub (counter_extension_settings_*_range). Ngoài cận ⇒ coi như vắng. */
export const INTERVAL_HOURS_RANGE = { min: 1, max: 168 };
export const TOAST_SECONDS_RANGE = { min: 1, max: 120 };

/** Màn Cài extension trên Hub; mở màn này trên Hub nào thì máy theo Hub đó (quay/hub-quay.js isExtensionPage). */
export const SETUP_PAGE_PATH = "/extension";

/** Lý do Hub mới gửi kèm khi không có Sheet review (YC-156 L6). Giá trị lạ ⇒ coi như không có lý do. */
export const REVIEW_SHEET_REASONS = ["NOT_CONFIGURED", "NO_BRANCH_ACCESS"];

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
  if (json && typeof json === "object" && Object.hasOwn(json, "reviewSheetReason")) {
    out.reviewSheetReason = REVIEW_SHEET_REASONS.includes(json.reviewSheetReason) ? json.reviewSheetReason : null;
  }
  if (hubHasSetupPage(json)) out.setupPage = true;
  return out;
}

/**
 * YC-156 L1 — Hub này có màn Cài extension (`/extension`) chưa. Production cũ chưa có màn ấy (mở ra là 404),
 * nên chỉ tin dấu của Hub mới: trường `reviewSheetReason` (Hub có L6) hoặc `reviewIds` trong danh sách cơ sở
 * scope=mine (thêm cùng đợt với màn Cài extension). Không có dấu ⇒ coi như chưa có, nút mở trang chủ Hub.
 */
export function hubHasSetupPage(json) {
  if (!json || typeof json !== "object") return false;
  if (Object.hasOwn(json, "reviewSheetReason")) return true;
  return Array.isArray(json.branches) && json.branches.some((b) => b && typeof b === "object" && Object.hasOwn(b, "reviewIds"));
}

/** Đường nút "Mở Hub" của popup: màn Cài extension khi Hub có màn ấy, không thì trang chủ Hub. */
export function setupPagePath(hub) {
  return hub?.setupPage ? SETUP_PAGE_PATH : "/";
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
  const own = (v) => String(v ?? "").trim();
  // H-1903 b: máy không có Sheet nào (Hub chưa có, máy cũng không có cấu hình cũ) vẫn gửi Hub, nên tên và mã
  // chỗ nghỉ theo cơ sở trên Hub. Máy còn Sheet cũ thì giữ tên cũ, kẻo dữ liệu Sheet cũ bị tách hai tên.
  const ownSheet = Boolean(own(c.sheetUrl) && own(c.secret));
  const branch = sheet || !ownSheet ? pick.branch ?? null : null;
  const ids = branch?.reviewIds ?? {};
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
    sheetReason: hub?.reviewSheetReason ?? null,
  };
}

/** Lượt quét có ghi Sheet không: chỉ khi máy có đủ URL Sheet và mã bí mật (theo Hub hoặc cấu hình cũ). */
export function reviewSendsSheet(review) {
  const r = review ?? {};
  return Boolean(r.sheetUrl && r.secret);
}

/**
 * Thu review chưa chạy được thì vì sao — lời hướng dẫn ba phần cho người đứng quầy (YC-158): chuyện gì,
 * vì sao, làm gì từng bước. Đủ cấu hình ⇒ null.
 */
export function reviewMissingHelp(review) {
  const r = review ?? {};
  // H-1903 b: thiếu Sheet chỉ chặn khi máy cũng chưa nhận gì từ Hub (không có chỗ nào để gửi review).
  if (!reviewSendsSheet(r) && !r.hubSeen) {
    return {
      what: "Thu review chưa chạy được trên máy này.",
      why: "Máy chưa nhận cấu hình từ Hub, vì Chrome này chưa đăng nhập Hub lần nào.",
      steps: [
        "Mở Hub trong Chrome này và đăng nhập bằng tài khoản của bạn.",
        "Mở màn Cài extension trên Hub, máy sẽ tự nhận cấu hình.",
        "Bấm biểu tượng Urban B trên thanh Chrome, rồi bấm Quét review ngay.",
      ],
    };
  }
  if (!r.hotel) {
    if (r.branchState === "ask")
      return {
        what: "Máy chưa biết mình thuộc chi nhánh nào.",
        why: "Tài khoản Hub đang đăng nhập có nhiều chi nhánh.",
        steps: [
          "Bấm biểu tượng Urban B trên thanh Chrome.",
          "Chọn chi nhánh của máy này trong ô chọn chi nhánh.",
          "Bấm Quét review ngay.",
        ],
      };
    return {
      what: "Máy chưa biết mình thuộc chi nhánh nào.",
      // YC-156 L6: Hub mới nói rõ tài khoản không lấy được cấu hình của chi nhánh nào (vd. thiếu quyền).
      why:
        r.sheetReason === "NO_BRANCH_ACCESS"
          ? "Tài khoản Hub đang đăng nhập không lấy được cấu hình máy quầy của chi nhánh nào."
          : "Tài khoản Hub đang đăng nhập chưa gắn với chi nhánh nào.",
      steps: [
        "Mở Hub, đăng xuất, rồi đăng nhập bằng tài khoản Lễ tân của chi nhánh này.",
        "Mở màn Cài extension trên Hub, máy sẽ tự nhận chi nhánh.",
      ],
    };
  }
  return null;
}

/**
 * H-1903 b: thu review chạy, gửi Hub, nhưng không ghi Sheet vì máy chưa có Sheet review. Lời cho lễ tân nói
 * rõ "chưa ghi Sheet" (không phải lỗi chặn). Còn bị chặn (`reviewMissingHelp`) hay có Sheet ⇒ null.
 */
export function sheetSkipHelp(review) {
  const r = review ?? {};
  if (reviewSendsSheet(r) || reviewMissingHelp(r)) return null;
  return {
    what: "Chưa ghi Sheet. Review vẫn gửi lên Hub.",
    ...(r.sheetReason === "NO_BRANCH_ACCESS"
      ? {
          why: "Tài khoản Hub đang đăng nhập không lấy được cấu hình máy quầy của chi nhánh nào.",
          steps: ["Mở Hub, đăng xuất, rồi đăng nhập bằng tài khoản Lễ tân của chi nhánh này."],
        }
      : { why: "Hub chưa có cấu hình Sheet review.", steps: [SHEET_PLACE_STEP] }),
  };
}

export function sheetSkipText(review) {
  const help = sheetSkipHelp(review);
  return help ? helpText(help) : null;
}

/** Bản một dòng của `reviewMissingHelp`; đủ cấu hình ⇒ null. */
export function reviewMissingText(review) {
  const help = reviewMissingHelp(review);
  return help ? helpText(help) : null;
}

/**
 * Kênh quét và chu kỳ thực dùng. Hub có trường nào thì trường ấy theo Hub; `branch` = cơ sở đang dùng
 * (pickBranch), cấu hình riêng của cơ sở thắng cấu hình cả chuỗi.
 * Hub vắng: kênh theo cấu hình của máy (mã cài đặt hoặc ô Kênh quét), chu kỳ theo mặc định của
 * extension (ô nhập chu kỳ tại máy đã bỏ, số cũ trong bộ nhớ không dùng nữa).
 */
export function effectiveCollect(cfg, hub, branch = null) {
  // YC-157 · H-1715 a: cơ sở có cấu hình riêng trên Hub ⇒ trường nào cơ sở đặt thì trường ấy thắng cả chuỗi.
  const own = branch?.reviewCollect ? parseHubSettings({ reviewCollect: branch.reviewCollect }) : {};
  const src = { ...hub, ...own };
  const fromHub = {
    enabled: Boolean(src.enabled),
    intervalHours: src.intervalHours !== undefined,
    branch: own.enabled !== undefined || own.intervalHours !== undefined,
  };
  return {
    enabled: fromHub.enabled ? { ...src.enabled } : { ...DEFAULT_CONFIG.enabled, ...(cfg?.enabled ?? {}) },
    intervalHours: fromHub.intervalHours ? src.intervalHours : DEFAULT_CONFIG.intervalHours,
    fromHub,
  };
}

/** Chu kỳ báo thức của lượt tự quét, tính bằng phút; không dày hơn 30 phút. */
export function alarmMinutes(intervalHours) {
  return Math.max(30, Math.round(Number(intervalHours || DEFAULT_CONFIG.intervalHours) * 60));
}

/**
 * Chữ dưới nút Quét: chu kỳ và nguồn của nó. YC-156 L4: thu review không tự chạy được (bị chặn theo
 * `reviewMissingHelp`, hoặc không bật kênh nào) ⇒ null, popup ẩn dòng, kẻo đọc như máy đang tự quét.
 */
export function scheduleText(eff, review = null) {
  if (review && reviewMissingHelp(review)) return null;
  if (!CHANNELS.some((ch) => eff?.enabled?.[ch])) return null;
  const src = eff.fromHub.branch
    ? "theo cấu hình riêng của chi nhánh trên Hub"
    : eff.fromHub.intervalHours
      ? "theo cấu hình trên Hub"
      : "mặc định, chưa nhận cấu hình từ Hub";
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
  const branches = stored[MINE_KEY]?.branches ?? null;
  const collect = effectiveCollect(cfg, hub, pickBranch(branches, stored[BRANCH_KEY] ?? "").branch ?? null);
  const review = effectiveReview(cfg, hub, branches, stored[BRANCH_KEY] ?? "");
  const { fromHub: _, branchState: __, hubSeen: ___, sheetReason: ____, ...fields } = review;
  return { ...cfg, ...fields, enabled: collect.enabled, intervalHours: collect.intervalHours, collect, review };
}
