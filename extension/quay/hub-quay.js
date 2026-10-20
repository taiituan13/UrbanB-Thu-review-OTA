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

import { DEFAULT_HUB_ORIGIN, HUB_ORIGINS } from "../env.js";

export const CONNECTION_PATH = "/api/extension/connection";
export const INDICATORS_PATH = "/api/extension/indicators";
export const LOGIN_PATH = "/login";
export const RESULTS_PATH = "/cong-suat/ket-qua";
export const NOTIFICATIONS_PAGE_PATH = "/notifications";

/** Khung đang mở thì đọc lại chỉ báo mỗi 5 phút (hằng kỹ thuật; job chỉ báo không chạy dày hơn thế). */
export const INDICATORS_REFRESH_MS = 5 * 60 * 1000;
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

export function connectionUrl(origin, hotelId, report) {
  const q = new URLSearchParams();
  if (hotelId) q.set("ezcloudHotelId", hotelId);
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
    }));
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
    options: [{ value: "", label: "Chọn cơ sở…" }, ...branches.map((b) => ({ value: b.id, label: label(b) }))],
    text: pick.state === "ask"
      ? `Tài khoản Hub của bạn có ${branches.length} cơ sở. Chọn cơ sở của máy quầy này để token Go2Joy gửi đúng Apps Script của khách sạn.`
      : "Token Go2Joy gửi về Apps Script của cơ sở này.",
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
  if (session === "nobranch" || why) return "Cơ sở: chưa xác định";
  if (UNREACHABLE.has(session) && !branchName) return "Không gọi được Hub";
  if (session === "expired") return `${branchName || "Cơ sở đã nhận"} · phiên Hub đã hết`;
  return branchName ? `${branchName} · theo PMS đang mở` : "Đang đọc cơ sở…";
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
      text: "Đăng nhập xong, khung tự nhận mã kết nối Booking OTA của cơ sở, hiện bảng khoá G2J, chỉ báo công suất và thông báo của bạn.",
      login: true,
    };
  if (UNREACHABLE.has(session) && !hasCache)
    return {
      tone: "bad",
      title: "Không gọi được Hub.",
      text: "Khung chưa nhận được cấu hình của cơ sở lần nào trên máy này. Kiểm tra mạng của máy quầy rồi bấm Thử lại.",
      retry: true,
    };
  if (session !== "nobranch") return null;
  if (why === "unmapped")
    return {
      tone: "bad",
      title: "Khách sạn đang mở trên PMS chưa được ghép với cơ sở nào trên Hub.",
      text: `Mã khách sạn ezCloud: ${hotelId}. Báo Quản trị hệ thống ghép mã này với cơ sở trên Hub; ghép xong, khung tự hiện booking và chỉ báo.`,
    };
  if (why === "scope")
    return {
      tone: "",
      title: branchName ? `PMS đang mở ${branchName}.` : "PMS đang mở một cơ sở bạn không được gán.",
      text: "Tài khoản đang đăng nhập Hub không được gán cơ sở này. Đổi khách sạn trên PMS về cơ sở của bạn để xem.",
    };
  return {
    tone: "",
    title: "Chưa biết PMS đang mở cơ sở nào.",
    text: "Khung đọc cơ sở từ yêu cầu PMS gửi đi. Mở một màn bất kỳ của PMS (ví dụ Sơ đồ phòng) là có.",
  };
}

/** Hub chưa có mã kết nối Booking OTA của cơ sở (otaSync null, không có bản đệm). */
export function noCodeNote(branchName) {
  return {
    tone: "bad",
    title: `Hub chưa có mã kết nối Booking OTA của ${branchName || "cơ sở này"}.`,
    text: "Báo Quản trị hệ thống nhập mã kết nối cho cơ sở trên Hub. Nhập xong, bấm Làm mới.",
  };
}

/** Apps Script từ chối mã kết nối Hub đang giữ. */
export function rejectedCodeNote(branchName, message) {
  return {
    tone: "bad",
    title: `Apps Script từ chối mã kết nối Booking OTA của ${branchName || "cơ sở này"}.`,
    text: `Hub đã được báo để Quản trị hệ thống kiểm lại mã. Lời Apps Script: ${message}`,
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

/**
 * Mô hình nút gập (H-1246 a: đổi màu, không tự mở).
 * `booking`: { issues, count } | null · `indicators`: { level, exceeded, at, stale } | null.
 * Trả `segs` theo thứ tự hiện: [{ text, bad?, dot? }].
 */
export function dockModel({ session, booking, indicators }) {
  if (session === "out") return { segs: [{ dot: "off", text: "chưa đăng nhập" }] };
  if (session === "nobranch") return { segs: [{ dot: "off", text: "chưa biết cơ sở" }] };
  const segs = [];
  if (booking) segs.push({ text: booking.issues ? `Booking ${booking.issues} lỗi` : `Booking ${booking.count}`, bad: booking.issues > 0 });
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
export function popupPmsRow(snap) {
  const session = snap?.session ?? "out";
  if (session === "out")
    return {
      tone: "off",
      state: "Chưa chạy",
      detail: "Booking OTA · Khoá G2J · Chỉ báo · Thông báo: cần đăng nhập Hub. Khung trên PMS cũng nhắc việc này.",
      subs: [],
    };
  const subs = [];
  const b = snap.booking;
  const branch = snap.branchName || "cơ sở";
  const unmapped = session === "nobranch" && snap.why === "unmapped";
  const unreachable = UNREACHABLE.has(session) || snap.codeState === "unknown";
  if (session === "nobranch")
    subs.push({ tone: unmapped ? "err" : "warn", text: unmapped ? "Booking OTA · Khoá G2J: khách sạn đang mở trên PMS chưa được ghép với cơ sở nào trên Hub — báo Quản trị hệ thống" : "Booking OTA · Khoá G2J: chưa biết PMS đang mở cơ sở nào", at: null });
  else if (unreachable && !b?.count && snap.codeState !== "ok") subs.push({ tone: "err", text: "Booking OTA · Khoá G2J: không gọi được Hub, máy chưa nhận mã kết nối lần nào", at: b?.at });
  else if (snap.codeState === "none") subs.push({ tone: "err", text: `Booking OTA · Khoá G2J: Hub chưa có mã kết nối Booking OTA của ${branch} — báo Quản trị hệ thống`, at: b?.at });
  else if (snap.codeState === "rejected") subs.push({ tone: "err", text: `Booking OTA · Khoá G2J: Apps Script từ chối mã kết nối của ${branch} — đã báo Hub`, at: b?.at });
  else if (b?.error) subs.push({ tone: "err", text: `Booking OTA · Khoá G2J: ${b.error}`, at: b.at });
  else if (b) subs.push({ tone: b.issues ? "warn" : "ok", text: `Booking OTA · Khoá G2J: ${b.count} booking${b.issues ? `, ${b.issues} booking lỗi` : ""}${snap.tokenAt ? ` · token PMS gửi ${hhmm(snap.tokenAt)}` : ""}`, at: b.at });
  else subs.push({ tone: "off", text: "Booking OTA · Khoá G2J: chưa mở PMS", at: null });

  const ind = snap.indicators;
  if (session === "expired") subs.push({ tone: "warn", text: "Chỉ báo: dừng cập nhật tới khi đăng nhập lại", at: ind?.at });
  else if (session === "nobranch") subs.push({ tone: unmapped ? "err" : "warn", text: unmapped ? "Chỉ báo: chưa có, vì khách sạn trên PMS chưa ghép với cơ sở" : "Chỉ báo: chưa biết PMS đang mở cơ sở nào", at: null });
  else if (UNREACHABLE.has(session) && !ind) subs.push({ tone: "err", text: "Chỉ báo: không gọi được Hub", at: null });
  else if (ind?.stale) subs.push({ tone: "err", text: `Chỉ báo: không gọi được Hub, đang hiện số lượt ${hhmm(ind.at)}`, at: ind.failedAt });
  else if (ind) subs.push({ tone: "ok", text: `Chỉ báo: ${branch} ${ind.exceeded ? ind.exceeded + " tình huống đang vượt" : "không có tình huống đang vượt"}`, at: ind.at });

  const n = snap.notifications;
  if (session === "expired") subs.push({ tone: "warn", text: "Thông báo: tạm không nhận", at: null });
  else if (n?.state === "ok") subs.push({ tone: "ok", text: n.unread ? `Thông báo: ${n.unread} chưa đọc — xem ở chip trên PMS` : "Thông báo: không có thông báo chưa đọc", at: n.at });
  // Route thông báo chưa có trên Hub ⇒ không hiện dòng nào (tính năng ẩn).

  const worst = subs.some((x) => x.tone === "err") ? "err" : subs.some((x) => x.tone === "warn") ? "warn" : "ok";
  const errCount = subs.filter((x) => x.tone === "err").length;
  const state =
    worst === "err" ? (errCount > 1 ? `Lỗi ở ${errCount} phần — xem từng dòng` : "Có lỗi — xem dòng dưới")
    : session === "expired" ? "Một phần dừng — phiên Hub đã hết"
    : "Đang chạy · 3 tab";
  return { tone: worst, state, detail: "Mở PMS ezCloud, bấm nút UrbanB tại quầy ở góc phải dưới.", subs };
}
