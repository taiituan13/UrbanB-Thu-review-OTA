// Gửi review lên Hub UrbanB (từ 1.5.2 là đường duy nhất, không còn Google Sheet). Phần thuần, test được ngoài Chrome.
//
// Từ 1.1.0 (YC-152 · H-1233 a): đẩy theo PHIÊN Hub của người đăng nhập trên máy quầy, không còn token
// máy. POST <hub>/api/ingest/reviews KHÔNG kèm header Authorization, gửi cookie phiên như các route
// extension khác (service worker gọi, quay/sw.js hubFetch). Hub ghi bài đứng tên người đăng nhập, kiểm
// quyền "thêm review" theo cơ sở. Hợp đồng (repo UrbanB, chỉ đọc): src/app/api/ingest/reviews/route.ts.
//   200 { ok, inserted, updated, unchanged, unmatched, errors: [{ index, key, error }],
//         rejected: [{ channel, channelHotelId, error: "OUT_OF_SCOPE" }] }
//   401 NOT_SIGNED_IN · 403 FORBIDDEN (không có quyền ở cơ sở nào) · 403 FORBIDDEN_ORIGIN · 413 · 400
// Thân JSON { action: "ingest" | "ping", reviews: [...] }, tối đa 500 bài và 2 MiB mỗi request.
// Hub chống trùng theo channel + reviewId và dùng `hash` để biết bài đổi, nên mỗi lượt quét gửi
// lại toàn bộ bài là an toàn: bài không đổi được đếm vào `unchanged`.

import { RetryableError } from "./report.js";

export const HUB_PATH = "/api/ingest/reviews";
export const LOGIN_PATH = "/login";

/** Ít hơn trần 500 bài của Hub, để một lô có JSON dài vẫn dưới trần 2 MiB. */
export const HUB_BATCH = 200;

/**
 * Các trường Hub nhận. Danh sách trắng: JSON gốc (`raw`) và mọi thứ khác không bao giờ rời máy
 * theo đường này. `guestName` (YC-188) chỉ có ở bài của kênh đã đo đường tên (normalize.js
 * GUEST_NAME_PATH); Hub nhận trường này tuỳ chọn, bản Hub cũ bỏ qua khoá lạ.
 */
export const HUB_FIELDS = [
  "channel",
  "reviewId",
  "channelHotelId",
  "hotel",
  "bookingCode",
  "reviewDate",
  "score",
  "scale",
  "title",
  "positive",
  "negative",
  "comment",
  "reply",
  "replyDate",
  "hash",
  "guestName",
];

/** Lỗi khi gửi Hub; cùng dạng RetryableError để dùng chung withRetry. */
export class HubError extends RetryableError {}

/** Địa chỉ nhận review trên Hub đang dùng (gốc đã qua danh sách cho phép ở quay/hub-quay.js hubOrigin). */
export function ingestUrl(origin) {
  return String(origin).replace(/\/+$/, "") + HUB_PATH;
}

/**
 * Một request gửi Hub: chỉ content-type, KHÔNG có Authorization. Hub chọn đường theo header này: có
 * header ⇒ đường token máy cũ (production không đặt token ⇒ 404). Cookie phiên do hubFetch kèm.
 */
export function ingestRequest(origin, body) {
  return {
    url: ingestUrl(origin),
    init: { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
  };
}

/** Câu báo chưa đăng nhập: lễ tân tự làm được, không phải lỗi của máy. */
export const NOT_SIGNED_IN_TEXT = "Chưa đăng nhập Hub, hoặc phiên Hub đã hết. Mở Hub, đăng nhập bằng tài khoản của bạn rồi bấm Quét review ngay.";

/**
 * Kiểu lượt gửi Hub (YC-157): mã ổn định thay chữ tiếng Việt của Sheet. Hub chỉ hiện nhãn cho mã nó
 * biết; kiểu lạ thì không gửi.
 */
// YC-199: lượt tự quét lại sau khi lễ tân đăng nhập kênh là lượt máy tự chạy, không phải người bấm ⇒ "schedule".
// YC-238: lượt đọc lại sau khi tab quét bị đóng cũng là lượt máy tự chạy ⇒ "schedule" (Hub đã biết mã này).
export const HUB_TRIGGER = {
  "hẹn giờ": "schedule",
  "bấm tay": "manual",
  "tự quét sau đăng nhập": "schedule",
  "đọc lại sau khi tab bị đóng": "schedule",
};

/**
 * Thông tin lượt gửi kèm mỗi lô (hợp đồng `device.deviceId` · `run.trigger` · `run.id`, Hub đọc ở
 * src/modules/reviews/ingest.rules.ts parseIngestRunMeta). Không có thông tin nào ⇒ không thêm khoá.
 */
export function hubRunMeta({ deviceId, trigger, runId } = {}) {
  const meta = {};
  if (deviceId) meta.device = { deviceId: String(deviceId) };
  const run = {};
  if (HUB_TRIGGER[trigger]) run.trigger = HUB_TRIGGER[trigger];
  if (runId) run.id = String(runId);
  if (Object.keys(run).length) meta.run = run;
  return meta;
}

/**
 * YC-152 (H-1489 a): điểm tổng của kênh mà bộ quét đọc trên extranet (snapshot `categoryCode: "overall"`),
 * gửi Hub kèm mã khách sạn trên kênh. Điểm hạng mục không gửi đi đâu (tới 1.5.1 chỉ đi Sheet). Không có
 * điểm hợp lệ ⇒ mảng rỗng.
 */
export function hubSnapshots(snapshots, channel, channelHotelId) {
  if (!channelHotelId) return [];
  return (snapshots ?? [])
    .filter((s) => s?.categoryCode === "overall" && Number.isFinite(Number(s.score)) && Number.isFinite(Number(s.scale)))
    .map((s) => ({ channel, channelHotelId: String(channelHotelId), categoryCode: "overall", score: Number(s.score), scale: Number(s.scale) }));
}

/**
 * Chia bài thành các thân request, mỗi thân tối đa `size` bài và chỉ mang trường trong HUB_FIELDS.
 * `meta` (hubRunMeta) đi kèm MỌI lô của cùng một lượt. Điểm tổng (`snapshots`, hubSnapshots) chỉ đi ở
 * lô đầu; lượt 0 bài mà có điểm vẫn gửi một lô `reviews: []` để Hub nhận điểm.
 */
export function hubBatches(reviews, size = HUB_BATCH, meta = {}, snapshots = []) {
  const rows = reviews.map((r) => Object.fromEntries(HUB_FIELDS.filter((f) => f in r).map((f) => [f, r[f]])));
  const out = [];
  for (let i = 0; i < rows.length; i += size) out.push({ action: "ingest", reviews: rows.slice(i, i + size), ...meta });
  if (snapshots.length) {
    if (out.length) out[0].snapshots = snapshots;
    else out.push({ action: "ingest", reviews: [], snapshots, ...meta });
  }
  return out;
}

/**
 * Đọc lời đáp của Hub cho một lô. `reply` là dạng quay/sw.js hubFetch trả:
 * `{ status, url, redirected, json }` (json = null khi thân không phải JSON) hoặc `{ netError }`.
 * Lỗi mạng hoặc máy chủ (5xx) thì gửi lại được; còn lại ném HubError không gửi lại.
 * Lỗi chưa đăng nhập mang `session: "out"` để service worker ghi trạng thái phiên.
 */
export function parseIngestReply(reply) {
  if (!reply || reply.netError) throw new HubError(`Không gọi được Hub: ${reply?.netError ?? "lỗi mạng"}`, true);
  const { status, json } = reply;
  let path = "";
  try {
    path = new URL(reply.url).pathname;
  } catch {}
  const code = json && typeof json.error === "string" ? json.error : "";
  if ((reply.redirected && path === LOGIN_PATH) || code === "NOT_SIGNED_IN" || status === 401) {
    throw Object.assign(new HubError(NOT_SIGNED_IN_TEXT, false), { session: "out" });
  }
  if (code === "FORBIDDEN_ORIGIN") {
    throw new HubError("Hub chặn lượt gửi vì không nhận ra nguồn gửi (FORBIDDEN_ORIGIN). Cập nhật extension; vẫn lỗi thì gửi mã lỗi.", false);
  }
  if (status === 403) {
    throw new HubError("Tài khoản đang đăng nhập Hub chưa có quyền thêm review ở chi nhánh nào (403). Đăng nhập đúng tài khoản lễ tân của chi nhánh, hoặc báo Quản trị hệ thống cấp quyền.", false);
  }
  if (status === 413) throw new HubError("Lô gửi Hub quá lớn (413).", false);
  if (status === 404 && !json) throw new HubError("Hub chưa bật cửa nhận review (404).", false);
  if (status >= 500) throw new HubError(`Hub lỗi máy chủ (HTTP ${status}).`, true);
  if (!json || typeof json !== "object") throw new HubError(`Hub trả về không phải JSON (HTTP ${status}).`, true);
  if (status !== 200 || json.ok !== true) throw new HubError(`Hub từ chối: ${code || `HTTP ${status}`}`, false);
  return json;
}

/** Cộng kết quả các lô. `index` của lỗi dòng được đổi về vị trí trong cả lượt. */
export function sumHubReplies(replies, size = HUB_BATCH) {
  const total = { inserted: 0, updated: 0, unchanged: 0, unmatched: 0, errors: [], rejected: [] };
  const seen = new Set();
  replies.forEach((r, b) => {
    for (const k of ["inserted", "updated", "unchanged", "unmatched"]) total[k] += Number(r?.[k]) || 0;
    for (const e of r?.errors ?? []) total.errors.push({ ...e, index: b * size + (Number(e?.index) || 0) });
    // Cùng một mã khách sạn bị từ chối ở mọi lô chứa nó ⇒ đếm một lần.
    for (const x of r?.rejected ?? []) {
      const key = `${x?.channel}|${x?.channelHotelId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      total.rejected.push({ channel: String(x?.channel ?? ""), channelHotelId: String(x?.channelHotelId ?? ""), error: String(x?.error ?? "") });
    }
  });
  return total;
}

/**
 * Dòng chữ ngắn cho ô bật lên, ví dụ "3 mới · 1 đổi · 662 chờ ghép". "Chờ ghép": mã khách sạn của kênh
 * chưa được ghép với cơ sở nào trên Hub, bài nằm ở chỗ chờ tới khi Quản trị hệ thống ghép.
 */
export function hubSummaryText(t) {
  const parts = [`${t.inserted} mới`, `${t.updated} đổi`];
  if (t.unmatched) parts.push(`${t.unmatched} chờ ghép`);
  if (t.rejected?.length) parts.push(`${t.rejected.length} mã ngoài phạm vi`);
  if (t.errors.length) parts.push(`${t.errors.length} bài lỗi`);
  return parts.join(" · ");
}

/**
 * Câu nhật ký cho nhóm bài Hub trả về `rejected`: mã khách sạn của kênh đã ghép vào một cơ sở mà
 * người đang đăng nhập không được gán. Hub vẫn ghi các nhóm khác.
 */
export function rejectedText(rejected) {
  const ids = rejected.map((x) => x.channelHotelId).join(", ");
  return `Hub không nhận bài của ${rejected.length} mã khách sạn ngoài phạm vi (${ids}): mã đã ghép vào chi nhánh mà tài khoản đang đăng nhập không được gán`;
}
