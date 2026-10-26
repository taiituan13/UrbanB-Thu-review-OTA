// YC-158 (H-1539 lối 2, user chốt 21/10/2026) — trạng thái thu review của máy này, một mô hình cho hai chỗ:
// - dòng "Thu review" trong tab Cần xử lý của khung quầy trên PMS (lễ tân thấy lỗi mà không phải bấm icon);
// - tin `ext:status` gửi màn Cài extension trên Hub (lỗi từng kênh của máy đang mở trang).
//
// Logic thuần, không đọc bộ nhớ: service worker đọc `status`, cấu hình và lời hướng dẫn rồi truyền vào.
// Tệp nằm trong quay/ để khung (content script) nhập được nếu cần; không nhập tệp ngoài quay/.

/**
 * YC-238 (H-1973 a): kênh đang chờ đọc lại vì tab quét bị đóng giữa chừng, `{ [kênh]: { closedAt, retryAt } }`
 * trong chrome.storage.local. Service worker ghi; khung quầy đọc để báo một dòng.
 */
export const TAB_RETRY_KEY = "tabRetry";

/**
 * @param {object} input
 * @param {Record<string, any>} input.status — `status` theo kênh (config.js loadStatus)
 * @param {string[]} input.order — thứ tự kênh (config.js CHANNELS)
 * @param {Record<string, boolean>} input.enabled — kênh đang bật
 * @param {Record<string, string>} input.labels — tên kênh hiện cho người dùng
 * @param {{what: string, why: string, steps: string[]} | null} input.missing — thu review chưa đủ cấu hình
 * @returns {{ state: "missing"|"none"|"never"|"bad"|"ok", missing: object|null, rows: object[], bad: number, lastOkAt: string|null }}
 */
export function reviewStatusModel({ status, order, enabled, labels, missing }) {
  const rows = order.filter((ch) => enabled?.[ch]).map((ch) => channelRow(ch, labels?.[ch] ?? ch, status?.[ch]));
  const bad = rows.filter((r) => r.state === "error" || r.state === "login").length;
  const okTimes = rows.map((r) => Date.parse(r.okAt ?? "")).filter((t) => !Number.isNaN(t));
  const lastOkAt = okTimes.length ? new Date(Math.max(...okTimes)).toISOString() : null;
  const state = missing ? "missing" : !rows.length ? "none" : bad ? "bad" : rows.every((r) => r.state === null) ? "never" : "ok";
  return { state, missing: missing ?? null, rows, bad, lastOkAt };
}

/**
 * Một kênh. Lượt quét ổn nhưng gửi Hub hỏng ⇒ vẫn là lỗi với lễ tân (review chưa lên Hub), lời hướng
 * dẫn là của lỗi gửi Hub.
 */
function channelRow(key, label, s) {
  if (!s) return { key, label, state: null, at: null, okAt: null, count: null, code: null, ref: null, help: null };
  const hubBad = s.state === "ok" && s.hub && s.hub.ok === false;
  const err = hubBad ? s.hub.error : s.state === "ok" ? null : s.error;
  const state = hubBad ? "error" : s.state === "login" ? "login" : s.state === "ok" ? "ok" : "error";
  return {
    key,
    label,
    state,
    at: s.at ?? null,
    // Bản cũ chưa ghi `okAt`: lượt cuối ổn thì giờ lượt cuối là giờ ổn gần nhất.
    okAt: s.okAt ?? (s.state === "ok" && !hubBad ? s.at ?? null : null),
    count: Number.isInteger(s.count) ? s.count : null,
    code: err?.code ?? null,
    ref: err?.ref ?? null,
    help: err?.help ?? (err?.hint ? { what: err.hint, why: "", steps: [] } : null),
  };
}

/** Kênh cho tin `ext:status` (hợp đồng `hub-bridge.rules.ts` của UrbanB): không URL, không mã bí mật. */
export function hubChannels(model) {
  return model.rows.map((r) => ({
    channel: r.key,
    state: r.state,
    at: r.at,
    okAt: r.okAt,
    count: r.count,
    code: r.code,
    ref: r.ref,
    what: r.help?.what ?? null,
    why: r.help?.why || null,
    steps: r.help?.steps ?? [],
  }));
}

const VN = "Asia/Ho_Chi_Minh";

/** Giờ theo giờ Việt Nam: "08:02" nếu cùng ngày với `now`, khác ngày thì "08:02 ngày 20/10". */
export function hhmm(iso, now = new Date()) {
  const d = new Date(iso ?? "");
  if (Number.isNaN(d.getTime())) return "";
  const time = d.toLocaleTimeString("en-GB", { timeZone: VN, hour: "2-digit", minute: "2-digit", hour12: false });
  const day = (x) => x.toLocaleDateString("en-GB", { timeZone: VN, day: "2-digit", month: "2-digit" });
  return day(d) === day(now) ? time : `${time} ngày ${day(d)}`;
}

/** Câu tóm tắt một dòng cho khung khi không có lỗi, hoặc làm tiêu đề khối khi có lỗi. */
export function reviewSummaryText(model, now = new Date()) {
  if (model.state === "missing") return "Thu review chưa chạy được trên máy này.";
  if (model.state === "none") return "Thu review chưa bật kênh nào.";
  if (model.state === "never") return "Thu review chưa quét lần nào. Máy tự quét trong ít phút nữa.";
  if (model.state === "bad") return model.bad === 1 ? "Thu review đang lỗi ở 1 kênh." : `Thu review đang lỗi ở ${model.bad} kênh.`;
  return model.lastOkAt ? `Thu review chạy bình thường, quét được lần cuối lúc ${hhmm(model.lastOkAt, now)}.` : "Thu review chạy bình thường.";
}

/** Dòng phụ của một kênh lỗi: lỗi lúc nào, quét được lần cuối lúc nào. */
export function failedWhenText(row, now = new Date()) {
  const at = hhmm(row.at, now);
  if (!at) return "";
  const ok = hhmm(row.okAt, now);
  return ok ? `Lỗi lúc ${at}, quét được lần cuối lúc ${ok}.` : `Lỗi lúc ${at}, chưa quét được lần nào.`;
}
