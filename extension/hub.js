// Gửi review lên Hub UrbanB (YC-45), song song với Google Sheet. Phần thuần, test được ngoài Chrome.
//
// Hợp đồng do phía Hub công bố 09/10/2026 (UrbanB: BAO-CAO-lane-yc45-review-ingest.md mục 4):
// POST <hub>/api/ingest/reviews, header "Authorization: Bearer <token>", thân JSON
// { action: "ingest" | "ping", reviews: [...] }. Tối đa 500 bài và 2 MiB mỗi request.
// Hub chống trùng theo channel + reviewId và dùng `hash` để biết bài đổi, nên mỗi lượt quét gửi
// lại toàn bộ bài là an toàn: bài không đổi được đếm vào `unchanged`.

import { SheetError } from "./report.js";

export const HUB_PATH = "/api/ingest/reviews";

/** Ít hơn trần 500 bài của Hub, để một lô có JSON dài vẫn dưới trần 2 MiB. */
export const HUB_BATCH = 200;

/**
 * Tên miền Hub mà manifest.json cho phép gọi. Gửi tới tên miền khác thì Chrome chặn,
 * nên từ chối ngay ở ô cài đặt với câu đọc được. Thêm tên miền ⇒ sửa cả host_permissions.
 */
export const HUB_HOSTS = ["urbanb.xyz", "hub.urbanb.vn"];

/**
 * Các trường Hub nhận. Danh sách trắng: JSON gốc (`raw`) và mọi thứ khác không bao giờ rời máy
 * theo đường này. Tên khách đã bị gỡ từ bước chuẩn hoá.
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
];

/** Lỗi khi gửi Hub; cùng dạng SheetError để dùng chung withRetry. */
export class HubError extends SheetError {}

/** URL người dùng điền (gốc trang hoặc cả đường dẫn) ⇒ địa chỉ nhận review. Sai ⇒ ném HubError. */
export function hubEndpoint(input) {
  let u;
  try {
    u = new URL(String(input ?? "").trim());
  } catch {
    throw new HubError("URL Hub sai dạng. Điền dạng https://hub.urbanb.vn", false);
  }
  if (u.protocol !== "https:" || !HUB_HOSTS.includes(u.hostname)) {
    throw new HubError(`URL Hub phải là https://${HUB_HOSTS.join(" hoặc https://")}`, false);
  }
  return u.origin + HUB_PATH;
}

/** Chia bài thành các thân request, mỗi thân tối đa `size` bài và chỉ mang trường trong HUB_FIELDS. */
export function hubBatches(reviews, size = HUB_BATCH) {
  const rows = reviews.map((r) => Object.fromEntries(HUB_FIELDS.filter((f) => f in r).map((f) => [f, r[f]])));
  const out = [];
  for (let i = 0; i < rows.length; i += size) out.push({ action: "ingest", reviews: rows.slice(i, i + size) });
  return out;
}

/** Đọc câu trả lời của Hub theo mã HTTP. Lỗi mạng hoặc máy chủ (5xx) thì gửi lại được. */
export function parseHubReply(status, body) {
  if (status === 401) throw new HubError("Hub từ chối token (401). Dán lại Token Hub.", false);
  if (status === 404) throw new HubError("Hub chưa bật cửa nhận review (404).", false);
  if (status === 413) throw new HubError("Lô gửi Hub quá lớn (413).", false);
  let j = null;
  try {
    j = JSON.parse(body);
  } catch {}
  if (status >= 500) throw new HubError(`Hub lỗi máy chủ (HTTP ${status}).`, true);
  if (!j || typeof j !== "object") throw new HubError(`Hub trả về không phải JSON (HTTP ${status}).`, true);
  if (status !== 200 || !j.ok) throw new HubError(`Hub từ chối: ${String(j.error ?? `HTTP ${status}`)}`, false);
  return j;
}

/** Cộng kết quả các lô. `index` của lỗi dòng được đổi về vị trí trong cả lượt. */
export function sumHubReplies(replies, size = HUB_BATCH) {
  const total = { inserted: 0, updated: 0, unchanged: 0, unmatched: 0, errors: [] };
  replies.forEach((r, b) => {
    for (const k of ["inserted", "updated", "unchanged", "unmatched"]) total[k] += Number(r?.[k]) || 0;
    for (const e of r?.errors ?? []) total.errors.push({ ...e, index: b * size + (Number(e?.index) || 0) });
  });
  return total;
}

/** Dòng chữ ngắn cho ô bật lên, ví dụ "3 mới · 1 đổi · 662 chưa ghép". */
export function hubSummaryText(t) {
  const parts = [`${t.inserted} mới`, `${t.updated} đổi`];
  if (t.unmatched) parts.push(`${t.unmatched} chưa ghép`);
  if (t.errors.length) parts.push(`${t.errors.length} bài lỗi`);
  return parts.join(" · ");
}
