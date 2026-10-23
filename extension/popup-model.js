// Mô hình chữ của popup "UrbanB tại quầy" cho mục Thu review OTA. Logic thuần (test ở test/popup-model.test.mjs).
// Mục "Khung trên PMS" dùng quay/hub-quay.js popupPmsRow.

import { CHANNEL_LABEL } from "./report.js";
import { HUB_COUNTER_PLACE, reviewMissingText } from "./hub-config.js";

/** Giờ "08:02" theo giờ máy. */
export function hm(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}

/** Câu khi chưa bật kênh nào: kênh đặt trên Hub thì người ở quầy không tự bật được. */
export function noChannelText(cfg) {
  return cfg?.collect?.fromHub?.enabled
    ? `Cấu hình trên Hub chưa bật kênh nào. Nhắn Quản trị hệ thống bật kênh trên Hub: ${HUB_COUNTER_PLACE}.`
    : `Kênh quét do Hub đặt. Nhắn Quản trị hệ thống bật kênh trên Hub: ${HUB_COUNTER_PLACE}.`;
}

/**
 * Dòng "Thu review OTA": chấm màu, tình trạng, một dòng nói cần làm gì.
 * `cfg` = cấu hình 0.9.0 (config.js) · `status` = trạng thái lượt quét từng kênh.
 */
export function reviewRow(cfg, status, channels) {
  const enabled = channels.filter((ch) => cfg?.enabled?.[ch]);
  if (!cfg?.sheetUrl || !cfg?.secret || !cfg?.hotel)
    return { tone: "warn", state: "Chưa cài đặt xong", when: "", detail: reviewMissingText(cfg.review ?? cfg) };
  if (!enabled.length) return { tone: "off", state: "Chưa bật kênh nào", when: "", detail: noChannelText(cfg) };
  const rows = enabled.map((ch) => ({ ch, s: status?.[ch] }));
  const bad = rows.filter((r) => r.s && r.s.state !== "ok");
  const login = bad.filter((r) => r.s.state === "login");
  const never = rows.filter((r) => !r.s);
  const latest = rows.map((r) => r.s?.at).filter(Boolean).sort().pop() ?? "";
  const total = rows.reduce((n, r) => n + (Number(r.s?.count) || 0), 0);
  if (bad.length) {
    const names = bad.map((r) => CHANNEL_LABEL[r.ch] ?? r.ch).join(", ");
    return {
      tone: login.length === bad.length ? "warn" : "err",
      state: login.length === bad.length ? `${bad.length} kênh cần đăng nhập lại` : `${bad.length} kênh lỗi`,
      when: latest ? hm(latest) : "",
      detail: login.length === bad.length
        ? `${names}: mở trang quản lý khách sạn của kênh trong Chrome này và đăng nhập. Lượt quét sau tự chạy.`
        : `${names}: xem từng kênh bên dưới, mỗi kênh có các bước cần làm và mã lỗi để gửi người quản lý.`,
    };
  }
  // Sheet nhận bình thường mà Hub không nhận (H-1233 a: review lên Hub theo phiên đăng nhập).
  const hubBad = rows.filter((r) => r.s?.hub && !r.s.hub.ok);
  if (hubBad.length) {
    const names = hubBad.map((r) => CHANNEL_LABEL[r.ch] ?? r.ch).join(", ");
    const login = hubBad.every((r) => r.s.hub.login);
    return {
      tone: login ? "warn" : "err",
      state: login ? "Review chưa lên Hub, cần đăng nhập Hub" : `Gửi Hub lỗi ở ${hubBad.length} kênh`,
      when: latest ? hm(latest) : "",
      detail: login
        ? "Sheet vẫn nhận bình thường. Bấm Đăng nhập Hub và đăng nhập bằng tài khoản của bạn. Lượt quét sau tự gửi lên Hub."
        : `${names}: Sheet vẫn nhận. Xem từng kênh bên dưới, mỗi kênh có các bước cần làm và mã lỗi để gửi người quản lý.`,
    };
  }
  if (never.length === rows.length) return { tone: "off", state: `Chưa quét lần nào, ${rows.length} kênh đang bật`, when: "", detail: "Bấm Quét review ngay, hoặc chờ máy tự quét." };
  return {
    tone: "ok",
    state: `Đang chạy, ${rows.length} kênh`,
    when: latest ? hm(latest) : "",
    detail: `Lượt trước được ${total} bài. Máy tự quét mỗi ${Math.max(1, Number(cfg.intervalHours) || 6)} giờ.`,
  };
}

/**
 * Khối "Thu review OTA" trong Cài đặt (H-1527 a): mỗi dòng một thứ máy đang dùng và nguồn của nó.
 * `cfg` = loadEffectiveConfig (hub-config.js). Không in URL Sheet hay mã bí mật. Trả `[{ text, warn? }]`.
 */
export function reviewSourceLines(cfg, channels) {
  const r = cfg?.review ?? { fromHub: {} };
  const from = r.fromHub ?? {};
  const lines = [];
  if (from.sheet) lines.push({ text: "Sheet thu review: theo cấu hình trên Hub." });
  else if (r.sheetUrl && r.secret) lines.push({ text: "Hub chưa có cấu hình thu review. Máy đang chạy bằng cấu hình cũ trong bộ nhớ.", warn: true });
  if (r.hotel) lines.push({ text: `Tên khách sạn: ${r.hotel} (${from.hotel ? "tên chi nhánh trên Hub" : "cấu hình cũ của máy"}).` });
  const missing = reviewMissingText(r);
  if (missing) lines.push({ text: missing, warn: true });
  const on = channels.filter((ch) => cfg?.enabled?.[ch]).map((ch) => CHANNEL_LABEL[ch] ?? ch);
  const chFrom = cfg?.collect?.fromHub?.enabled ? "theo Hub" : "cấu hình của máy";
  lines.push({ text: `Kênh quét: ${on.length ? on.join(", ") : "chưa bật kênh nào"} (${chFrom}).` });
  const ids = [
    ["booking", "Booking", r.bookingHotelId],
    ["agoda", "Agoda", r.agodaPropertyId],
    ["expedia", "Expedia", r.expediaPropertyId],
  ].map(([k, label, v]) => (v ? `${label} ${v}${from[k] ? " (Hub)" : " (cấu hình cũ)"}` : `${label} tự dò`));
  lines.push({ text: `Mã chỗ nghỉ: ${ids.join(", ")}.` });
  return lines;
}
