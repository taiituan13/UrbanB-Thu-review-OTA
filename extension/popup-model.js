// Mô hình chữ của popup "UrbanB tại quầy" cho mục Thu review OTA. Logic thuần (test ở test/popup-model.test.mjs).
// Mục "Khung trên PMS" dùng quay/hub-quay.js popupPmsRow.

import { CHANNEL_LABEL } from "./report.js";

/** Giờ "08:02" theo giờ máy. */
export function hm(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}

/**
 * Dòng "Thu review OTA": chấm màu, tình trạng, một dòng nói cần làm gì.
 * `cfg` = cấu hình 0.9.0 (config.js) · `status` = trạng thái lượt quét từng kênh.
 */
export function reviewRow(cfg, status, channels) {
  const enabled = channels.filter((ch) => cfg?.enabled?.[ch]);
  if (!cfg?.sheetUrl || !cfg?.secret || !cfg?.hotel)
    return { tone: "warn", state: "Chưa cài đặt xong", when: "", detail: "Mở Cài đặt bên dưới, dán Mã cài đặt người quản lý gửi (bắt đầu bằng URB1.) rồi bấm Nhận mã." };
  if (!enabled.length) return { tone: "off", state: "Chưa bật kênh nào", when: "", detail: "Mở Cài đặt, chọn kênh rồi bấm Lưu." };
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
        ? `${names}: mở extranet trong Chrome này và đăng nhập, lượt quét sau tự chạy.`
        : `${names}: xem từng kênh bên dưới, có mã lỗi để gửi người quản lý.`,
    };
  }
  // Sheet nhận bình thường mà Hub không nhận (H-1233 a: review lên Hub theo phiên đăng nhập).
  const hubBad = rows.filter((r) => r.s?.hub && !r.s.hub.ok);
  if (hubBad.length) {
    const names = hubBad.map((r) => CHANNEL_LABEL[r.ch] ?? r.ch).join(", ");
    const login = hubBad.every((r) => r.s.hub.login);
    return {
      tone: login ? "warn" : "err",
      state: login ? "Review chưa lên Hub · cần đăng nhập Hub" : `Gửi Hub lỗi ở ${hubBad.length} kênh`,
      when: latest ? hm(latest) : "",
      detail: login
        ? "Sheet vẫn nhận bình thường. Bấm Đăng nhập Hub bằng tài khoản của bạn, lượt quét sau tự gửi lên Hub."
        : `${names}: Sheet vẫn nhận; xem từng kênh bên dưới, có mã lỗi để gửi người quản lý.`,
    };
  }
  if (never.length === rows.length) return { tone: "off", state: `Chưa quét lần nào · ${rows.length} kênh`, when: "", detail: "Bấm Quét review ngay, hoặc chờ lượt tự quét." };
  return {
    tone: "ok",
    state: `Đang chạy · ${rows.length} kênh`,
    when: latest ? hm(latest) : "",
    detail: `Lượt trước ${total} bài · tự quét mỗi ${Math.max(1, Number(cfg.intervalHours) || 6)} giờ.`,
  };
}
