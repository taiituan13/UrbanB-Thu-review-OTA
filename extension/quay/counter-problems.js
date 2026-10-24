// YC-193 — mọi lỗi máy quầy ĐANG HIỆN cho lễ tân, gom thành trường `problems` của lượt báo sống để Quản trị
// thấy trên màn Máy quầy của Hub mà khỏi chờ lễ tân báo. Logic thuần: không gọi mạng, không đọc chrome.*.
//
// Hợp đồng (repo UrbanB, chỉ đọc: src/modules/reviews/counter-extension/counter-problems.rules.ts):
//   problems: [{ code, detail?, since? }]
// - Một ẢNH, không phải nhật ký: có trường ⇒ Hub thay ảnh cũ; mảng rỗng ⇒ máy hết lỗi.
// - Hub chỉ giữ `detail` của vài mã (mã KS ezCloud, loại token, câu lỗi Apps Script, bản mới nhất); mã khác bỏ.
// - Câu giải thích và cách sửa sống ở Hub, theo mã. Không gửi URL, mã bí mật, chữ review.
// - Lỗi từng kênh review đã đi theo `channels`/`failures` (counter-heartbeat.js) — không gửi lại ở đây.
//
// Nguồn từng mã: _bmad-output/implementation-artifacts/DO-yc193-loi-may-quay.md (repo UrbanB, làn yc192).

import { updateNotice } from "../update.js";

/** Khoá giữ lỗi mà service worker biết lúc gọi nhưng trước đây không lưu: `{ board?, lock?, indicators? }`. */
export const FAULTS_KEY = "quayFaults";
export const FAULT_KINDS = ["board", "lock", "indicators"];

const iso = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

const text = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Ghi / xoá một lỗi vào bản `quayFaults`: `fault` null ⇒ xoá (lượt gọi vừa ổn). Trả bản mới, không sửa bản cũ. */
export function withFault(faults, kind, fault) {
  if (!FAULT_KINDS.includes(kind)) return { ...(faults ?? {}) };
  const next = { ...(faults ?? {}) };
  if (fault) next[kind] = { at: iso(fault.at), message: text(fault.message) };
  else delete next[kind];
  return next;
}

const SESSION_CODE = { expired: "HUB_SESSION_EXPIRED", out: "HUB_SIGNED_OUT", net: "HUB_UNREACHABLE", server: "HUB_UNREACHABLE", forbidden: "HUB_UNREACHABLE" };
const NOBRANCH_CODE = { unmapped: "PMS_HOTEL_NOT_LINKED", scope: "PMS_OUT_OF_SCOPE", gone: "PMS_BRANCH_GONE" };

/**
 * Ảnh lỗi gửi Hub. Mọi trường vào đều đọc phòng thủ (bộ nhớ có thể là bản của phiên bản cũ).
 * - `snap`: `quaySnap` · `faults`: `quayFaults` · `tokenAt`: `{ ezcloud, go2joy }` từ `quayTokenAt:*`
 * - `scanCrash`, `lastError`: khoá cùng tên · `update`: khoá `update` · `version`: bản đang chạy
 * - `reviewMissing`: máy chưa cấu hình xong thu review · `g2jAsk`: máy nhiều chi nhánh chưa chọn chi nhánh
 */
export function counterProblems({
  snap = null,
  faults = null,
  tokenAt = {},
  scanCrash = null,
  lastError = null,
  update = null,
  version = "",
  reviewMissing = false,
  g2jAsk = false,
} = {}) {
  const out = [];
  const add = (code, detail = null, since = null) => {
    if (out.some((p) => p.code === code)) return;
    const p = { code };
    if (text(detail)) p.detail = text(detail);
    if (iso(since)) p.since = iso(since);
    out.push(p);
  };

  // Kết nối Hub. Lúc đang xảy ra thường không gửi được (route đòi phiên), nhưng ảnh vẫn nói đúng sự thật.
  const s = SESSION_CODE[snap?.session];
  if (s) add(s, null, snap?.updatedAt);

  // Khung PMS
  if (snap?.session === "nobranch") {
    const code = NOBRANCH_CODE[snap?.why];
    if (code) add(code, code === "PMS_HOTEL_NOT_LINKED" ? snap?.hotelId : null, snap?.updatedAt);
  }
  if (snap?.codeState === "none") add("OTA_CODE_MISSING");
  else if (snap?.codeState === "rejected") add("OTA_CODE_REJECTED", snap?.booking?.error, snap?.booking?.at);
  else if (text(snap?.booking?.error)) add("OTA_SHEET_ERROR", snap.booking.error, snap?.booking?.at);
  if (faults?.board) add("LOCK_BOARD_FAILED", faults.board.message, faults.board.at);
  if (faults?.lock) add("G2J_LOCK_FAILED", faults.lock.message, faults.lock.at);
  if (faults?.indicators) add("INDICATORS_UNREACHABLE", null, faults.indicators.at);
  const rejected = ["ezcloud", "go2joy"].filter((k) => tokenAt?.[k]?.outcome === "rejected");
  if (rejected.length) add("TOKEN_REJECTED", rejected.join(","), tokenAt[rejected[0]]?.at);
  if (g2jAsk) add("G2J_BRANCH_NOT_CHOSEN");
  if (snap?.notifications?.state === "net" || snap?.notifications?.state === "server") {
    add("NOTIFICATIONS_UNREACHABLE", null, snap.notifications.at);
  }
  if (snap?.tampermonkey === true) add("TAMPERMONKEY_LEFT");

  // Quét review (ngoài lỗi từng kênh)
  if (reviewMissing) add("REVIEW_NOT_CONFIGURED");
  if (scanCrash) add("REVIEW_SCAN_CRASH", null, scanCrash.at);
  if (lastError?.stage === "gửi Sheet") add("REVIEW_SHEET_FAILED", lastError.code, lastError.at);

  // Bản extension
  const notice = updateNotice(update, version);
  if (notice) add("UPDATE_AVAILABLE", notice.latest, update?.at);

  return out;
}

/** Chữ ký của ảnh lỗi (chỉ mã, đã xếp): đổi chữ ký ⇒ tập lỗi đổi. Dùng để biết có nên báo Hub thêm một lượt. */
export function problemsSignature(problems) {
  return (Array.isArray(problems) ? problems : [])
    .map((p) => p?.code)
    .filter(Boolean)
    .sort()
    .join("|");
}
