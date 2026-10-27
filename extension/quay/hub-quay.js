// Phần Hub của "UrbanB tại quầy": gọi route nào, đọc lời đáp ra trạng thái nào, giữ bản đệm ra sao,
// và mô hình chữ cho nút gập, đầu khung, popup. Logic thuần: không gọi mạng, không đọc chrome.*.
//
// Route (repo UrbanB, chỉ đọc):
//   GET /api/extension/connection?ezcloudHotelId=…[&report=rejected|accepted&message=…]
//   GET /api/extension/connection?scope=mine            (chỉ đọc: cơ sở của người đăng nhập + cấu hình chung)
//   GET /api/extension/connection?branchId=…[&report=…]  (một cơ sở đã chọn từ danh sách; ghi lượt gọi như đường ezcloudHotelId)
//   GET /api/extension/indicators?ezcloudHotelId=…
// Lỗi JSON: NOT_SIGNED_IN 401 · MISSING_HOTEL 400 · HOTEL_NOT_LINKED 404 · OUT_OF_SCOPE 403 · FORBIDDEN_ORIGIN 403 ·
//           BRANCH_NOT_FOUND 404 · INVALID_QUERY 400.

import { hubChannels } from "./review-status.js";
import { DEFAULT_HUB_ORIGIN, HUB_ORIGINS } from "../env.js";

export const CONNECTION_PATH = "/api/extension/connection";
export const INDICATORS_PATH = "/api/extension/indicators";
export const LOGIN_PATH = "/login";
export const RESULTS_PATH = "/cong-suat/ket-qua";
export const NOTIFICATIONS_PAGE_PATH = "/notifications";

/** Khung đang mở thì đọc lại chỉ báo mỗi 5 phút (hằng kỹ thuật; job chỉ báo không chạy dày hơn thế). */
export const INDICATORS_REFRESH_MS = 5 * 60 * 1000;
/**
 * Lễ tân quay lại tab PMS (sau khi đổi tab hay thu nhỏ cửa sổ) ⇒ đọc lại chỉ báo NGAY thay vì chờ lượt 5
 * phút kế tiếp (YC-159), trừ khi vừa đọc chưa tới 1 phút — đổi tab liên tục không dồn lượt gọi Hub.
 * Hằng kỹ thuật, không phải luật nghiệp vụ.
 */
export const INDICATORS_ON_VISIBLE_MIN_GAP_MS = 60 * 1000;

/** `lastAt` = lúc khung hỏi chỉ báo gần nhất (ms), chưa hỏi lần nào ⇒ null. */
export function reloadIndicatorsOnVisible(lastAt, now) {
  return !Number.isFinite(lastAt) || now - lastAt >= INDICATORS_ON_VISIBLE_MIN_GAP_MS;
}
/** Mã kết nối đã nhận dùng lại tới 30 phút mới hỏi lại Hub (mỗi lượt hỏi Hub ghi "máy quầy gọi lần cuối"). */
export const CONNECTION_MAX_AGE_MS = 30 * 60 * 1000;

/** Gốc Hub đang dùng: chỉ nhận gốc trong danh sách cho phép; còn lại ⇒ mặc định. */
export function hubOrigin(raw) {
  try {
    const o = new URL(String(raw ?? "")).origin;
    if (HUB_ORIGINS.includes(o)) return o;
  } catch {}
  return DEFAULT_HUB_ORIGIN;
}

/**
 * `seen` (YC-192, tuỳ chọn) = `{ hotelName, deviceId }`: tên khách sạn trên ezCloud đọc từ tiêu đề tab và mã máy.
 * Mã chưa ghép thì Hub ghi lại lượt thấy để Quản trị chọn chi nhánh ghép; Hub bản cũ bỏ qua hai tham số này.
 */
export function connectionUrl(origin, hotelId, report, seen = null) {
  const q = new URLSearchParams();
  if (hotelId) q.set("ezcloudHotelId", hotelId);
  if (hotelId && seen?.hotelName) q.set("ezcloudHotelName", String(seen.hotelName).slice(0, 200));
  if (hotelId && seen?.deviceId) q.set("deviceId", String(seen.deviceId).slice(0, 100));
  if (report) {
    q.set("report", report.kind);
    if (report.message) q.set("message", String(report.message).slice(0, 300));
  }
  const s = q.toString();
  return origin + CONNECTION_PATH + (s ? "?" + s : "");
}

/** Lượt liệt kê cơ sở của người đăng nhập (H-1351 c). Chỉ đọc: Hub không ghi "máy quầy gọi lần cuối". */
export function mineUrl(origin) {
  return origin + CONNECTION_PATH + "?scope=mine";
}

/** Mã kết nối của một cơ sở người dùng đã chọn (H-1351 c); `report` như đường ezcloudHotelId. */
export function branchConnectionUrl(origin, branchId, report) {
  const q = new URLSearchParams({ branchId });
  if (report) {
    q.set("report", report.kind);
    if (report.message) q.set("message", String(report.message).slice(0, 300));
  }
  return origin + CONNECTION_PATH + "?" + q.toString();
}

/**
 * Danh sách cơ sở của lượt `scope=mine` ⇒ `[{ id, name, code, ezcloudHotelId }]`. Không giữ mã kết nối
 * ở đây: mã của cơ sở được chọn lấy qua `?branchId=` (lượt ấy Hub ghi "máy quầy gọi lần cuối").
 * Không phải danh sách ⇒ null.
 */
export function parseMine(json) {
  if (!json || json.ok !== true || !Array.isArray(json.branches)) return null;
  return json.branches
    .filter((b) => b && typeof b.id === "string" && b.id)
    .map((b) => ({
      id: b.id,
      name: typeof b.name === "string" ? b.name : "",
      code: typeof b.code === "string" ? b.code : "",
      ezcloudHotelId: b.ezcloudHotelId == null ? "" : String(b.ezcloudHotelId),
      reviewIds: parseReviewIds(b.reviewIds),
      // YC-157 · H-1715 a: cấu hình thu review riêng của cơ sở (cùng dạng `reviewCollect` của cả chuỗi),
      // null ⇒ theo cả chuỗi. Giữ nguyên bản Hub gửi; hub-config.js đọc qua parseHubSettings.
      reviewCollect: b.reviewCollect && typeof b.reviewCollect === "object" ? b.reviewCollect : null,
    }));
}

/** Kênh có mã chỗ nghỉ đặt trên Hub (H-1527 a). Các kênh khác tự dò. */
export const REVIEW_ID_CHANNELS = ["booking", "agoda", "expedia"];

/**
 * `reviewIds` của một cơ sở (H-1527 a) ⇒ `{ booking, agoda, expedia }`, mỗi ô là chuỗi hoặc null.
 * Vắng trường, sai dạng, chuỗi rỗng ⇒ null: kênh ấy giữ hành vi tự dò như trước.
 */
export function parseReviewIds(raw) {
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  return Object.fromEntries(
    REVIEW_ID_CHANNELS.map((ch) => {
      const v = src[ch];
      const s = typeof v === "string" || typeof v === "number" ? String(v).trim() : "";
      return [ch, s || null];
    }),
  );
}

// ---------- Màn "Cài extension" trên Hub (YC-156 · H-1526 a) ----------

/** Đường của màn Cài extension trên Hub. Trang ở đường này ⇒ extension theo Hub của trang. */
export function isExtensionPage(pathname) {
  return /^\/extension\/?$/.test(String(pathname ?? ""));
}

/**
 * Trang Hub ở gốc `requested` (màn Cài extension) muốn extension theo. `current` = gốc đang lưu.
 * Gốc ngoài danh sách cho phép ⇒ "reject"; cùng gốc ⇒ "same" (không xoá gì); khác ⇒ "switch".
 */
export function followHub(current, requested) {
  if (!HUB_ORIGINS.includes(String(requested ?? ""))) return "reject";
  return hubOrigin(current) === requested ? "same" : "switch";
}

const isoOrNull = (v) => {
  if (v == null || v === "") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

/**
 * Trạng thái extension trả cho trang Hub (tin `ext:status`, hợp đồng YC-156 với làn Hub).
 * Chỉ các trường dưới đây: KHÔNG có token, mã bí mật, URL Sheet hay mã kết nối.
 * - `session`: trạng thái phiên Hub (ok · nobranch ⇒ đã đăng nhập; out · expired ⇒ chưa; khác ⇒ null).
 * - `pms`: `{ at, hotelId }` lần gần nhất khung chạy trên PMS; tên cơ sở tra theo danh sách `branches`,
 *   không có thì theo tên khung đã nhận (`snap.branchName` của cùng mã KS).
 * - `review`: `{ configured, fromHub, model }`, `model` = `reviewStatusModel(...)` (quay/review-status.js);
 *   tin trả `lastScanAt` = giờ lượt quét ỔN gần nhất và `channels` = lỗi từng kênh đang bật (YC-158).
 */
export function extStatusOf({ version, hub, pageOrigin, session, branches, chosenId, pms, snap, review }) {
  const pick = pickBranch(branches ?? null, chosenId ?? "");
  const hotelId = pms?.hotelId ? String(pms.hotelId) : "";
  const listed = hotelId && Array.isArray(branches) ? branches.find((b) => b.ezcloudHotelId === hotelId) : null;
  const shown = hotelId && snap?.hotelId === hotelId ? snap.branchName : "";
  return {
    version: String(version ?? ""),
    hub,
    hubFollowed: hub === pageOrigin,
    signedIn: session === "ok" || session === "nobranch" ? true : session === "out" || session === "expired" ? false : null,
    branch: pick.branch ? { id: pick.branch.id, name: pick.branch.name } : null,
    pms: { lastSeenAt: isoOrNull(pms?.at), hotelName: listed?.name || shown || null },
    // YC-158: `lastScanAt` là lượt quét ỔN gần nhất của kênh đang bật (trước đây tính cả lượt lỗi và kênh
    // đã tắt ⇒ máy hỏng hết vẫn hiện "Quét lần cuối 14:05"); `channels` là lỗi từng kênh cho màn Cài extension.
    review: {
      configured: Boolean(review?.configured),
      fromHub: Boolean(review?.fromHub),
      lastScanAt: review?.model?.lastOkAt ?? null,
      channels: review?.model ? hubChannels(review.model) : [],
    },
  };
}

/**
 * Cơ sở của máy quầy theo danh sách của người đăng nhập (H-1351 c):
 * - `unknown`: chưa có danh sách (chưa đăng nhập, Hub cũ chưa có `scope=mine`);
 * - `none`: tài khoản không có cơ sở nào; `one`: đúng một cơ sở ⇒ dùng luôn;
 * - `chosen`: nhiều cơ sở, người dùng đã chọn một cơ sở còn trong danh sách; `ask`: nhiều cơ sở, chưa chọn.
 */
export function pickBranch(branches, chosenId) {
  if (!Array.isArray(branches)) return { state: "unknown" };
  if (!branches.length) return { state: "none" };
  const chosen = chosenId && branches.find((b) => b.id === chosenId);
  if (chosen) return { state: branches.length === 1 ? "one" : "chosen", branch: chosen };
  if (branches.length === 1) return { state: "one", branch: branches[0] };
  return { state: "ask" };
}

/**
 * Token Go2Joy gửi về Apps Script của cơ sở nào. Go2Joy không mang mã khách sạn ezCloud.
 * - Có danh sách: cơ sở duy nhất hoặc cơ sở đã chọn ⇒ `{ branchId }`; nhiều cơ sở chưa chọn ⇒ `{ ask }`
 *   (không đoán); không có cơ sở ⇒ null.
 * - Chưa có danh sách: cơ sở đã chọn trước đó (dùng bản đệm mã, H-1245 a), không có thì như bản 1.0.0 —
 *   khách sạn PMS mở gần nhất.
 */
export function go2joyTarget({ branches, chosenId, lastHotel }) {
  const pick = pickBranch(branches, chosenId);
  if (pick.branch) return { branchId: pick.branch.id };
  if (pick.state === "ask") return { ask: true, count: branches.length };
  if (pick.state === "none") return null;
  if (chosenId) return { branchId: chosenId };
  return lastHotel ? { hotelId: lastHotel } : null;
}

/**
 * Ô chọn cơ sở trong popup: chỉ hiện khi tài khoản có từ hai cơ sở. `ask` ⇒ chưa chọn, cần làm ngay.
 */
export function branchPicker(branches, chosenId) {
  const pick = pickBranch(branches, chosenId);
  if (pick.state !== "ask" && pick.state !== "chosen") return null;
  const label = (b) => [b.code, b.name].filter(Boolean).join(" · ") || b.id;
  return {
    ask: pick.state === "ask",
    value: pick.branch?.id ?? "",
    options: [{ value: "", label: "Chọn chi nhánh…" }, ...branches.map((b) => ({ value: b.id, label: label(b) }))],
    text: pick.state === "ask"
      ? `Tài khoản Hub của bạn có ${branches.length} chi nhánh. Chọn chi nhánh của máy quầy này để token Go2Joy gửi về đúng khách sạn.`
      : "Token Go2Joy gửi về bảng tính của chi nhánh này.",
  };
}

export function indicatorsUrl(origin, hotelId) {
  return origin + INDICATORS_PATH + "?" + new URLSearchParams({ ezcloudHotelId: hotelId }).toString();
}

/** Mở thẳng một tình huống trên màn Kết quả chỉ báo (repo UrbanB: capacityResultCaseHref). */
export function caseUrl(origin, situationId) {
  return origin + RESULTS_PATH + "?" + new URLSearchParams({ case: situationId }).toString();
}

export function resultsUrl(origin, branchId) {
  return origin + RESULTS_PATH + (branchId ? "?" + new URLSearchParams({ br: branchId }).toString() : "");
}

const ERROR_STATE = {
  NOT_SIGNED_IN: { state: "out" },
  MISSING_HOTEL: { state: "nobranch", why: "wait" },
  HOTEL_NOT_LINKED: { state: "nobranch", why: "unmapped" },
  OUT_OF_SCOPE: { state: "nobranch", why: "scope" },
  FORBIDDEN_ORIGIN: { state: "forbidden" },
  BRANCH_NOT_FOUND: { state: "nobranch", why: "gone" },
};

/**
 * Lời đáp của một route Hub ⇒ trạng thái.
 * `reply`: `{ status, url, redirected, json }` (json = null khi thân không phải JSON) hoặc `{ netError }`.
 * - ok · out (chưa đăng nhập) · nobranch (wait | unmapped | scope) · forbidden · server · net.
 * - Bị chuyển hướng về /login (proxy cũ, hoặc route chưa loại khỏi proxy) ⇒ out.
 * - 404 không phải JSON của Hub ⇒ `missing` (route chưa có trên Hub này).
 */
export function classifyHubReply(reply) {
  if (!reply || reply.netError) return { state: "net", message: reply?.netError ?? "Không gọi được Hub" };
  const { status, json } = reply;
  let path = "";
  try {
    path = new URL(reply.url).pathname;
  } catch {}
  if (reply.redirected && path === LOGIN_PATH) return { state: "out" };
  if (json && json.ok === true) return { state: "ok", data: json };
  const code = json && typeof json.error === "string" ? json.error : "";
  if (ERROR_STATE[code]) return { ...ERROR_STATE[code], code };
  if (status === 401) return { state: "out" };
  if (status === 404 && !json) return { state: "missing" };
  return { state: "server", message: `Hub trả lỗi ${status}${code ? " " + code : ""}` };
}

/**
 * Trạng thái phiên Hub, theo H-1245 a: hết phiên mà máy đã từng nhận cấu hình ⇒ `expired`
 * (Booking OTA và Khoá G2J chạy tiếp bằng bản đã nhận; chỉ báo, thông báo dừng). Chưa từng ⇒ `out`.
 */
export function sessionState(lastState, everSignedIn) {
  if (lastState === "out") return everSignedIn ? "expired" : "out";
  return lastState;
}

/**
 * Lượt gọi Hub vừa gặp "chưa đăng nhập": ảnh trạng thái cần sửa gì. Ảnh đã đúng phiên ⇒ null (không
 * ghi). Bản 1.0.0 ghi mỗi lượt ⇒ popup đang mở vẽ lại, hỏi Hub lại, ghi lại: hàng trăm lượt gọi mỗi giây.
 */
export function outSessionPatch(snap, everSignedIn) {
  const session = sessionState("out", everSignedIn);
  return snap?.session === session ? null : { session };
}

/** Trạng thái "không hỏi được Hub" (khác với chưa đăng nhập): có bản đệm thì chạy tiếp bằng bản đệm. */
export const UNREACHABLE = new Set(["net", "server", "forbidden", "missing"]);

/** Hết phiên thì phần nào còn chạy (H-1245 a). */
export const RUNS_WHEN_EXPIRED = { bookings: true, board: true, indicators: false, notifications: false, reviews: false };

/**
 * Mã kết nối Booking OTA dùng được không. Hub trả `otaSync: null` ⇒ Hub chưa có mã cho cơ sở này.
 * Có bản đệm từ trước thì vẫn dùng (H-1245 a: hết phiên chạy bằng cấu hình đã nhận lần trước).
 */
export function usableOtaSync(fresh, cached) {
  const pick = fresh !== undefined ? fresh : cached?.otaSync;
  if (!pick || !pick.webAppUrl) return null;
  return { webAppUrl: pick.webAppUrl, pushKey: pick.pushKey ?? "", apiToken: pick.apiToken ?? "", updatedAt: pick.updatedAt ?? null };
}

/** Bản đệm còn mới không. */
export function isFresh(entry, now, maxAgeMs) {
  return Boolean(entry?.at) && now - entry.at < maxAgeMs;
}

/**
 * Có cần báo Hub kết quả dùng mã không (đường `report=`). Chỉ báo khi kết quả đổi so với lần báo trước
 * của đúng mã ấy (theo `updatedAt`): mỗi lượt báo là một lần ghi ở Hub.
 */
export function reportToSend(lastReport, otaSync, outcome) {
  if (!otaSync) return null;
  const stamp = String(otaSync.updatedAt ?? "");
  if (outcome.kind === "rejected") {
    if (lastReport?.stamp === stamp && lastReport.kind === "rejected") return null;
    return { kind: "rejected", message: outcome.message ?? "", stamp };
  }
  if (outcome.kind === "accepted") {
    // Chỉ cần xoá dấu "Bị từ chối" khi chính máy này đã đặt nó.
    if (lastReport?.kind !== "rejected") return null;
    return { kind: "accepted", message: "", stamp };
  }
  return null;
}

// ---------- Chữ trên khung ----------

/** Dòng phụ dưới tên khung. */
export function frameSubtitle({ session, branchName, why }) {
  if (session === "out") return "Chưa đăng nhập Hub";
  if (session === "nobranch" || why) return "Chưa biết chi nhánh nào";
  if (UNREACHABLE.has(session) && !branchName) return "Không gọi được Hub";
  if (session === "expired") return `${branchName || "Chi nhánh đã nhận"}, phiên Hub đã hết`;
  return branchName ? `${branchName}, theo PMS đang mở` : "Đang đọc chi nhánh…";
}

/**
 * Khối chặn cả ba tab: chưa đăng nhập, hoặc chưa biết cơ sở (mã kết nối và chỉ báo đều đi theo cơ sở).
 * Hết phiên (expired) KHÔNG chặn: Booking OTA và Khoá G2J chạy tiếp.
 */
export function blockedNote({ session, why, hotelId, branchName, hasCache = false }) {
  if (session === "out")
    return {
      tone: "",
      title: "Đăng nhập Hub để bắt đầu.",
      text: "Đăng nhập xong, khung tự nhận mã kết nối Booking OTA của chi nhánh, hiện bảng khoá G2J, chỉ báo công suất và thông báo của bạn.",
      login: true,
    };
  if (UNREACHABLE.has(session) && !hasCache)
    return {
      tone: "bad",
      title: "Không gọi được Hub.",
      text: "Khung chưa nhận được cấu hình của chi nhánh lần nào trên máy này. Kiểm tra mạng của máy quầy rồi bấm Thử lại.",
      retry: true,
    };
  if (session !== "nobranch") return null;
  if (why === "unmapped")
    return {
      tone: "bad",
      title: "Khách sạn đang mở trên PMS chưa được ghép với chi nhánh nào trên Hub.",
      text: `Mã khách sạn ezCloud: ${hotelId}. Gửi mã này cho Quản trị hệ thống để ghép với chi nhánh trên Hub (màn Chi nhánh, khối Mã ezCloud chưa ghép). Ghép xong, khung tự hiện booking và chỉ báo.`,
    };
  if (why === "scope")
    return {
      tone: "",
      title: branchName ? `PMS đang mở ${branchName}.` : "PMS đang mở một chi nhánh bạn không được gán.",
      text: "Tài khoản đang đăng nhập Hub không được gán chi nhánh này. Đổi khách sạn trên PMS về chi nhánh của bạn để xem.",
    };
  return {
    tone: "",
    title: "Chưa biết PMS đang mở chi nhánh nào.",
    text: "Khung đọc chi nhánh từ yêu cầu PMS gửi đi. Mở một màn bất kỳ của PMS (ví dụ Sơ đồ phòng) là có.",
  };
}

/** Hub chưa có mã kết nối Booking OTA của cơ sở (otaSync null, không có bản đệm). */
export function noCodeNote(branchName) {
  return {
    tone: "bad",
    title: `Hub chưa có mã kết nối Booking OTA của ${branchName || "chi nhánh này"}.`,
    text: "Báo Quản trị hệ thống nhập mã kết nối cho chi nhánh trên Hub. Nhập xong, bấm Làm mới.",
  };
}

/** Apps Script từ chối mã kết nối Hub đang giữ. Lễ tân đọc câu này ⇒ nói "Google Sheet của khách sạn", không nói "Apps Script". */
export function rejectedCodeNote(branchName, message) {
  return {
    tone: "bad",
    title: `Google Sheet của khách sạn không nhận mã kết nối Booking OTA của ${branchName || "chi nhánh này"}.`,
    text: `Hub đã tự báo Quản trị hệ thống kiểm lại mã, bạn chưa cần làm gì. Khi mã đã sửa, bấm Làm mới. Chi tiết lỗi: ${message}`,
  };
}

/** Hết phiên Hub trong tab Chỉ báo (H-1245 a). */
export function expiredIndicatorsNote() {
  return {
    tone: "",
    title: "Phiên đăng nhập Hub đã hết. Chỉ báo dừng cập nhật.",
    text: "Booking OTA và Khoá G2J vẫn chạy bằng cấu hình đã nhận. Đăng nhập lại để xem số mới.",
    login: true,
    loginLabel: "Đăng nhập lại Hub",
  };
}

/** Hết phiên Hub trong danh sách thông báo (H-1245 a). */
export function expiredNotificationsNote() {
  return {
    tone: "",
    title: "Phiên đăng nhập Hub đã hết. Thông báo mới tạm không về.",
    text: "Đăng nhập lại để nhận tiếp. Thông báo đã nhận vẫn xem được trên Hub.",
    login: true,
    loginLabel: "Đăng nhập lại Hub",
  };
}

/** "09:35" theo giờ máy. */
export function hhmm(at) {
  if (!at) return "";
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return "";
  return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}

/** "09:35" nếu cùng ngày với `now`, khác ngày ⇒ "09:35 ngày 25/10" (lời báo token giữ qua nhiều ngày). */
export function whenText(at, now) {
  const t = hhmm(at);
  if (!t) return "";
  const d = new Date(at);
  const n = new Date(now);
  if (d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate()) return t;
  return `${t} ngày ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Câu lỗi Apps Script trước khi hiện cho lễ tân: bỏ mọi thứ trông như token, khoá, URL hay email,
 * cắt còn 200 ký tự. Apps Script không trả token trong câu lỗi; đây là chốt chặn thứ hai.
 */
export function scrubSecrets(text) {
  return String(text ?? "")
    .replace(/eyJ[\w-]+\.[\w-]+\.?[\w-]*/g, "…")
    .replace(/https?:\/\/\S+/gi, "…")
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "…")
    .replace(/[A-Za-z0-9_+/=-]{32,}/g, "…")
    .trim()
    .slice(0, 200);
}

const TOKEN_WHAT = { ezcloud: "phiên đăng nhập PMS", go2joy: "phiên đăng nhập Go2Joy" };
const TOKEN_REOPEN = { ezcloud: "PMS", go2joy: "trang HA Go2Joy" };

const HEALTH_STATES = new Set(["ok", "auth-failed", "pending", "missing"]);

/**
 * Sức khoẻ token ezCloud mà Google Sheet của khách sạn báo kèm lượt đọc `recent` và `board` (YC-240 ②).
 * Hợp đồng do Apps Script giữ (repo ezcloud-ota-booking-sync):
 *   result.tokenHealth.ezcloud = { state: ok|auth-failed|pending|missing, savedAt, authFailedAt, waitingRows, message }
 * Bản Apps Script cũ không có trường này, trạng thái lạ hay sai dạng ⇒ null (không hiện gì, không báo lỗi).
 * Không giữ `message`: chữ hiện do extension viết. `at` = lúc máy đọc được.
 */
export function readTokenHealth(result, at) {
  const h = result?.tokenHealth?.ezcloud;
  if (!h || typeof h !== "object" || !HEALTH_STATES.has(h.state)) return null;
  const iso = (v) => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? v : null);
  const n = Math.floor(Number(h.waitingRows));
  return { state: h.state, savedAt: iso(h.savedAt), authFailedAt: iso(h.authFailedAt), waitingRows: n > 0 ? n : 0, at };
}

/** Bản sức khoẻ token đọc gần nhất trong các lượt (recent, board); không có ⇒ null. */
export function latestHealth(...list) {
  return list.filter((h) => h && Number.isFinite(h.at)).sort((a, b) => b.at - a.at)[0] ?? null;
}

/**
 * Bản đọc sức khoẻ còn đúng không: máy lưu được (`saved`) token ezCloud mới sau lượt đọc ⇒ bản đọc đã cũ,
 * chờ lượt đọc kế. `unchanged` không tính: có thể chính token đã chết được gửi lại.
 */
export function healthIsCurrent(health, tokens) {
  if (!health) return false;
  const ez = tokens?.ezcloud;
  return !(ez?.outcome === "saved" && ez.at > health.at);
}

/** Dòng cho sức khoẻ token ezCloud; `ok` ⇒ null. */
function healthAlert(h, now) {
  const waiting = h.waitingRows ? `${h.waitingRows} booking đang chờ vào ezCloud` : "";
  if (h.state === "auth-failed") {
    const when = h.authFailedAt ? ` lúc ${whenText(Date.parse(h.authFailedAt), now)}` : "";
    return { kind: "ezcloud", tone: "err", at: h.at, short: "ezCloud từ chối phiên PMS", text: `Booking OTA: ezCloud đã từ chối phiên đăng nhập PMS${when}${waiting ? `, ${waiting}` : ""}. Mở lại hoặc đăng nhập lại PMS để máy gửi phiên mới.` };
  }
  if (h.state === "pending")
    return { kind: "ezcloud", tone: "warn", at: h.at, short: "Phiên PMS chờ xác nhận", text: `Booking OTA: Phiên đăng nhập PMS mới đang chờ Quản lý cơ sở xác nhận ở bước 2 trên Google Sheet của khách sạn${waiting ? `, ${waiting}` : ""}.` };
  if (h.state === "missing")
    return { kind: "ezcloud", tone: "err", at: h.at, short: "Sheet chưa có phiên PMS", text: `Booking OTA: Google Sheet của khách sạn chưa có phiên đăng nhập PMS${waiting ? `, ${waiting}` : ""}. Báo Quản trị hệ thống dán mã kết nối Booking OTA lên Hub.` };
  return null;
}

/**
 * Lời báo bền về phiên đăng nhập (token) máy gửi Google Sheet của khách sạn (YC-240, H-1980 a).
 * `tokens` = { ezcloud, go2joy }, mỗi mục là lượt đẩy gần nhất `{ at, outcome, message, codeRejected }`
 * (sw.js flushToken). Bị từ chối hoặc chờ xác nhận ⇒ một dòng, giữ tới lượt đẩy kế được lưu
 * (saved / unchanged); không tự hết theo giờ (①).
 * `health` = readTokenHealth của lượt đọc gần nhất (②): token đã lưu rồi chết, chờ xác nhận, chưa có. Máy vừa
 * lưu được token mới sau lượt đọc ấy ⇒ bản đọc đã cũ, chờ lượt đọc kế. Trả [{ kind, tone, text, short, at }],
 * lỗi đứng trước.
 */
export function tokenAlerts({ tokens, health = null, now = Date.now() } = {}) {
  const out = [];
  const fromHealth = healthIsCurrent(health, tokens) ? healthAlert(health, now) : null;
  if (fromHealth) out.push(fromHealth);
  for (const kind of ["ezcloud", "go2joy"]) {
    const t = tokens?.[kind];
    if (!t?.at) continue;
    const when = whenText(t.at, now);
    const what = TOKEN_WHAT[kind];
    const detail = scrubSecrets(t.message);
    if (t.outcome === "rejected" && t.codeRejected)
      out.push({ kind, tone: "err", at: t.at, short: "Mã kết nối bị từ chối", text: `Booking OTA: Google Sheet của khách sạn không nhận mã kết nối, nên ${what} máy gửi lúc ${when} chưa được lưu. Máy đã báo Hub, báo Quản trị hệ thống nhập lại mã.` });
    else if (t.outcome === "rejected")
      out.push({ kind, tone: "err", at: t.at, short: kind === "go2joy" ? "Phiên Go2Joy bị từ chối" : "Phiên PMS bị từ chối", text: `Booking OTA: Google Sheet của khách sạn không nhận ${what} máy gửi lúc ${when}. Mở lại hoặc đăng nhập lại ${TOKEN_REOPEN[kind]} để máy gửi phiên mới.${detail ? ` Chi tiết: ${detail}` : ""}` });
    else if (t.outcome === "pending" && !(kind === "ezcloud" && fromHealth?.short === "Phiên PMS chờ xác nhận"))
      out.push({ kind, tone: "warn", at: t.at, short: kind === "go2joy" ? "Phiên Go2Joy chờ xác nhận" : "Phiên PMS chờ xác nhận", text: `Booking OTA: ${what[0].toUpperCase() + what.slice(1)} máy gửi lúc ${when} đang chờ Quản lý cơ sở xác nhận ở bước 2 trên Google Sheet của khách sạn.` });
  }
  return [...out.filter((x) => x.tone === "err"), ...out.filter((x) => x.tone !== "err")];
}

/**
 * Mô hình nút gập (H-1246 a: đổi màu, không tự mở).
 * `booking`: { issues, count } | null · `indicators`: { level, exceeded, at, stale } | null.
 * `token`: lời báo phiên đăng nhập đứng đầu (tokenAlerts) | null: nút gập nói luôn, lễ tân khỏi mở khung mới thấy.
 * Trả `segs` theo thứ tự hiện: [{ text, bad?, dot? }].
 */
export function dockModel({ session, booking, indicators, token = null }) {
  if (session === "out") return { segs: [{ dot: "off", text: "chưa đăng nhập" }] };
  if (session === "nobranch") return { segs: [{ dot: "off", text: "chưa biết chi nhánh" }] };
  const segs = [];
  if (booking) segs.push({ text: booking.issues ? `Booking ${booking.issues} lỗi` : `Booking ${booking.count}`, bad: booking.issues > 0 });
  if (token) segs.push({ text: token.short, bad: token.tone === "err" });
  if (session === "expired") segs.push({ dot: "off", text: "Chỉ báo dừng cập nhật" });
  else if (!indicators) segs.push({ dot: "off", text: "Chỉ báo …" });
  else if (indicators.stale) segs.push({ dot: "cy", text: `Chỉ báo số ${hhmm(indicators.at)}` });
  else if (!indicators.exceeded) segs.push({ dot: "ok", text: "Chỉ báo không vượt" });
  else segs.push({ dot: indicators.level, text: `Chỉ báo ${indicators.exceeded} đang vượt` });
  return { segs };
}

// ---------- Popup ----------

/**
 * Mô hình mục "Khung trên PMS" của popup. Mỗi phần một dòng con có chấm riêng, để khi hỏng lễ tân
 * đọc được phần nào hỏng. `snap` là ảnh trạng thái service worker giữ (background.js quayStatus).
 */
export function popupPmsRow(snap, now = Date.now()) {
  const session = snap?.session ?? "out";
  if (session === "out")
    return {
      tone: "off",
      state: "Chưa chạy",
      detail: "Booking OTA, Khoá G2J, Chỉ báo và Thông báo cần đăng nhập Hub. Khung trên PMS cũng nhắc việc này.",
      subs: [],
    };
  const subs = [];
  const b = snap.booking;
  const branch = snap.branchName || "chi nhánh";
  const unmapped = session === "nobranch" && snap.why === "unmapped";
  const unreachable = UNREACHABLE.has(session) || snap.codeState === "unknown";
  if (session === "nobranch")
    subs.push({ tone: unmapped ? "err" : "warn", text: unmapped ? "Booking OTA và Khoá G2J chưa chạy: khách sạn đang mở trên PMS chưa được ghép với chi nhánh nào trên Hub. Báo Quản trị hệ thống." : "Booking OTA và Khoá G2J: chưa biết PMS đang mở chi nhánh nào. Mở một màn bất kỳ của PMS là có.", at: null });
  else if (unreachable && !b?.count && snap.codeState !== "ok") subs.push({ tone: "err", text: "Booking OTA và Khoá G2J: không gọi được Hub, máy chưa nhận mã kết nối lần nào. Kiểm tra mạng của máy quầy.", at: b?.at });
  else if (snap.codeState === "none") subs.push({ tone: "err", text: `Booking OTA và Khoá G2J: Hub chưa có mã kết nối Booking OTA của ${branch}. Báo Quản trị hệ thống.`, at: b?.at });
  else if (snap.codeState === "rejected") subs.push({ tone: "err", text: `Booking OTA và Khoá G2J: Google Sheet của khách sạn không nhận mã kết nối của ${branch}. Máy đã báo Hub, báo Quản trị hệ thống nhập lại mã.`, at: b?.at });
  else if (b?.error) subs.push({ tone: "err", text: `Booking OTA và Khoá G2J: ${b.error}`, at: b.at });
  else if (b) subs.push({ tone: b.issues ? "warn" : "ok", text: `Booking OTA và Khoá G2J: ${b.count} booking${b.issues ? `, ${b.issues} booking lỗi` : ""}${snap.tokenAt ? `. Đã gửi phiên đăng nhập PMS lúc ${hhmm(snap.tokenAt)}` : ""}`, at: b.at });
  else subs.push({ tone: "off", text: "Booking OTA và Khoá G2J: chưa mở PMS", at: null, pmsClosed: true });
  // YC-240: phiên đăng nhập gửi Google Sheet bị từ chối / chờ xác nhận ⇒ dòng riêng, giữ tới khi lưu được.
  if (session !== "nobranch") for (const a of tokenAlerts({ tokens: snap.tokens, health: snap.tokenHealth, now })) subs.push({ tone: a.tone, text: a.text, at: a.at });

  const ind = snap.indicators;
  if (session === "expired") subs.push({ tone: "warn", text: "Chỉ báo: dừng cập nhật tới khi đăng nhập lại", at: ind?.at });
  else if (session === "nobranch") subs.push({ tone: unmapped ? "err" : "warn", text: unmapped ? "Chỉ báo: chưa có, vì khách sạn trên PMS chưa ghép với chi nhánh" : "Chỉ báo: chưa biết PMS đang mở chi nhánh nào", at: null });
  else if (UNREACHABLE.has(session) && !ind) subs.push({ tone: "err", text: "Chỉ báo: không gọi được Hub", at: null });
  else if (ind?.stale) subs.push({ tone: "err", text: `Chỉ báo: không gọi được Hub, đang hiện số lượt ${hhmm(ind.at)}`, at: ind.failedAt });
  else if (ind) subs.push({ tone: "ok", text: `Chỉ báo: ${branch} ${ind.exceeded ? ind.exceeded + " tình huống đang vượt" : "không có tình huống đang vượt"}`, at: ind.at });

  const n = snap.notifications;
  if (session === "expired") subs.push({ tone: "warn", text: "Thông báo: tạm không nhận", at: null });
  else if (n?.state === "ok") subs.push({ tone: "ok", text: n.unread ? `Thông báo: ${n.unread} chưa đọc, xem ở nút Thông báo trên PMS` : "Thông báo: không có thông báo chưa đọc", at: n.at });
  // Route thông báo chưa có trên Hub ⇒ không hiện dòng nào (tính năng ẩn).

  const worst = subs.some((x) => x.tone === "err") ? "err" : subs.some((x) => x.tone === "warn") ? "warn" : "ok";
  const errCount = subs.filter((x) => x.tone === "err").length;
  // YC-156 L3: khung chưa chạy trên PMS (máy chưa mở PMS từ lần cài hay đổi Hub gần nhất) thì tiêu đề không
  // được nói "Đang chạy" cạnh dòng "chưa mở PMS".
  const pmsClosed = worst === "ok" && subs.some((x) => x.pmsClosed);
  const state =
    worst === "err" ? (errCount > 1 ? `Lỗi ở ${errCount} phần, xem từng dòng` : "Có lỗi, xem dòng dưới")
    : session === "expired" ? "Một phần dừng vì phiên Hub đã hết"
    : pmsClosed ? "Chưa mở PMS"
    : "Đang chạy";
  const clean = subs.map(({ pmsClosed: _, ...x }) => x);
  return { tone: pmsClosed ? "off" : worst, state, detail: "Mở PMS ezCloud, bấm nút Urban B ở góc phải dưới.", subs: clean };
}
