// Mô hình chữ của popup "UrbanB tại quầy" cho mục Thu review OTA. Logic thuần (test ở test/popup-model.test.mjs).
// Mục "Khung trên PMS" dùng quay/hub-quay.js popupPmsRow.

import { CHANNEL_LABEL } from "./report.js";
import { HUB_COUNTER_PLACE, SETUP_PAGE_PATH, reviewMissingText, sheetSkipText } from "./hub-config.js";
import { HUB_LABELS, HUB_ORIGINS } from "./env.js";
import { isNewer } from "./update.js";

/** Câu khi phần chạy nền của extension không trả lời popup (thường là vừa chép bản mới, chưa nạp xong). */
export const NO_WORKER_TEXT = "Extension chưa trả lời. Đóng ô này rồi mở lại; vẫn vậy thì vào chrome://extensions bấm nạp lại Urban B.";

/**
 * Nhãn Hub máy đang dùng. Phần chạy nền luôn trả gốc Hub (mặc định khi chưa chọn), nên thiếu gốc nghĩa là
 * popup không hỏi được nó: nói thẳng "chưa kết nối", không hiện chữ "Hub" trơn trông như đã kết nối.
 */
export function hubLabel(snap) {
  if (!snap?.origin) return "chưa kết nối";
  return HUB_LABELS[snap.origin] ?? snap.origin;
}

/**
 * Bản cài giải nén: chạy lệnh cài là chép bản mới lên đĩa, nhưng Chrome vẫn chạy bản đã nạp cho tới khi
 * nạp lại. Popup đọc tệp từ đĩa mỗi lần mở (`VERSION` của config.js là bản trên đĩa), còn
 * `chrome.runtime.getManifest()` là bản đang chạy. Trên đĩa mới hơn ⇒ popup nạp lại ngay.
 */
export function needsReload(diskVersion, runningVersion) {
  return isNewer(diskVersion, runningVersion);
}

/**
 * YC-156 L7 — dòng đầu popup: tài khoản nào đang đăng nhập Hub nào. Tên lấy từ route thông báo của Hub
 * (`snap.notifications.me`); popup hỏi lại route ấy mỗi lần mở nên tên có ngay cả khi chưa mở PMS.
 */
export function whoText(snap) {
  if (!snap) return NO_WORKER_TEXT;
  const session = snap.session ?? "out";
  const hub = hubLabel(snap);
  if (session === "out") return `Chưa đăng nhập ${hub}`;
  if (session === "expired") return `Phiên ${hub} đã hết`;
  if (snap?.net) return `Không gọi được ${hub}, đang hiện lượt trước`;
  const me = String(snap?.notifications?.me ?? "").trim();
  return `${me ? me + " đã đăng nhập " : "Đã đăng nhập "}${hub}${snap?.branchName ? ", đang mở " + snap.branchName : ""}`;
}

/**
 * YC-156 L1 — các Hub khác máy có thể chuyển sang. Máy tự theo Hub của màn Cài extension (quay/sw.js
 * extStatus), nên chuyển = mở màn ấy trên Hub kia. Chỉ các gốc trong env.js, không nhận URL lạ.
 */
export function hubSwitchTargets(currentOrigin) {
  return HUB_ORIGINS.filter((o) => o !== currentOrigin).map((o) => ({
    origin: o,
    label: HUB_LABELS[o] ?? o,
    url: o + SETUP_PAGE_PATH,
  }));
}

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
  const review = cfg?.review ?? cfg ?? {};
  const missing = reviewMissingText(review);
  if (missing) return { tone: "warn", state: "Chưa cài đặt xong", when: "", detail: missing };
  // H-1903 b: chưa có Sheet thì vẫn quét và gửi Hub; dòng nói rõ "chưa ghi Sheet", không phải lỗi chặn.
  const skip = sheetSkipText(review);
  const sheetNote = skip ? " Chưa ghi Sheet vì Hub chưa có cấu hình Sheet review." : "";
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
        ? `${skip ? "" : "Sheet vẫn nhận bình thường. "}Bấm Đăng nhập Hub và đăng nhập bằng tài khoản của bạn. Lượt quét sau tự gửi lên Hub.`
        : `${names}: ${skip ? "" : "Sheet vẫn nhận. "}Xem từng kênh bên dưới, mỗi kênh có các bước cần làm và mã lỗi để gửi người quản lý.`,
    };
  }
  if (never.length === rows.length) return { tone: "off", state: `Chưa quét lần nào, ${rows.length} kênh đang bật`, when: "", detail: `Bấm Quét review ngay, hoặc chờ máy tự quét.${sheetNote}` };
  return {
    tone: "ok",
    state: `Đang chạy, ${rows.length} kênh`,
    when: latest ? hm(latest) : "",
    detail: `Lượt trước được ${total} bài. Máy tự quét mỗi ${Math.max(1, Number(cfg.intervalHours) || 6)} giờ.${sheetNote}`,
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
  else if (r.sheetUrl && r.secret)
    lines.push({
      // YC-156 L6: Hub mới nói lý do; thiếu quyền thì không nói nhầm "Hub chưa có cấu hình".
      text:
        r.sheetReason === "NO_BRANCH_ACCESS"
          ? "Hub không gửi cấu hình Sheet cho tài khoản đang đăng nhập. Máy đang chạy bằng cấu hình cũ trong bộ nhớ."
          : "Hub chưa có cấu hình thu review. Máy đang chạy bằng cấu hình cũ trong bộ nhớ.",
      warn: true,
    });
  const skip = sheetSkipText(r);
  if (skip) lines.push({ text: skip, warn: true });
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
