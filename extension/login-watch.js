// YC-199 — quét lại một kênh sau lỗi đăng nhập. Logic thuần (test ở test/login-watch.test.mjs).
//
// Lỗi "cần đăng nhập lại" của một kênh trước đây chỉ hết ở lượt quét hẹn giờ kế tiếp (có khi vài giờ).
// Nay popup có hai nút trên dòng kênh ấy (mở trang đăng nhập · quét lại riêng kênh này), và extension tự
// quét lại kênh ấy khi thấy lễ tân đã vào được trang quản lý của kênh trong Chrome này.

/** Trang mở cho lễ tân đăng nhập: trang đầu extranet của kênh (chưa đăng nhập thì kênh tự chuyển sang trang đăng nhập). */
export const LOGIN_PAGE = {
  booking: "https://admin.booking.com/",
  agoda: "https://ycs.agoda.com/",
  trip: "https://ebooking.trip.com/",
  expedia: "https://apps.expediapartnercentral.com/",
  traveloka: "https://tera.traveloka.com/",
  go2joy: "https://ha.go2joy.vn/",
};

/**
 * Trang nằm TRONG extranet đã đăng nhập: đúng tên miền quản lý của kênh và không phải trang đăng nhập.
 * Trang đăng nhập theo `LOGIN_PATTERNS` của background.js; Traveloka và Go2Joy chưa đo được trang đăng nhập
 * nên nhận diện bằng chữ `login`/`sign-in` trên đường dẫn.
 */
const SIGNED_IN = {
  booking: (u) => u.hostname === "admin.booking.com" && !/sign-?in/i.test(u.pathname),
  agoda: (u) => (u.hostname === "ycs.agoda.com" || u.hostname === "portal.agoda.com") && !u.pathname.includes("/public/login"),
  trip: (u) => u.hostname === "ebooking.trip.com" && !u.pathname.startsWith("/login"),
  expedia: (u) =>
    (u.hostname === "apps.expediapartnercentral.com" || u.hostname === "www.expediapartnercentral.com") &&
    !/\/account\/logon|login/i.test(u.pathname),
  traveloka: (u) => u.hostname === "tera.traveloka.com" && !/login|sign-?in/i.test(u.pathname),
  go2joy: (u) => u.hostname === "ha.go2joy.vn" && !/login|sign-?in/i.test(u.pathname),
};

/** Kênh mà URL này là một trang đã đăng nhập; không phải trang extranet nào ⇒ `null`. */
export function signedInChannelOf(url) {
  let u;
  try {
    u = new URL(String(url ?? ""));
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  for (const [ch, ok] of Object.entries(SIGNED_IN)) if (ok(u)) return ch;
  return null;
}

/**
 * Khoảng nghỉ giữa hai lượt tự quét lại cùng một kênh. Hằng kỹ thuật, không phải số nghiệp vụ: chặn vòng lặp
 * khi trang trông như đã đăng nhập mà lượt quét vẫn bị đẩy về trang đăng nhập (mỗi lần tải trang lại kích một lượt).
 */
export const AUTO_RESCAN_COOLDOWN_MS = 3 * 60 * 1000;

/**
 * Kênh cần tự quét lại khi một tab vừa tải xong `url`, hoặc `null`. Đủ cả năm điều kiện: URL là trang đã đăng nhập
 * của kênh · kênh đang bật · lượt quét cuối của kênh báo cần đăng nhập · không có lượt quét nào đang chạy (không
 * quét chồng) · đã qua khoảng nghỉ kể từ lần tự quét trước của kênh ấy.
 */
export function autoRescanChannel({ url, enabled, status, running, lastTry = {}, now }) {
  if (running) return null;
  const ch = signedInChannelOf(url);
  if (!ch || !enabled?.[ch]) return null;
  if (status?.[ch]?.state !== "login") return null;
  const last = Number(lastTry[ch]) || 0;
  return now - last >= AUTO_RESCAN_COOLDOWN_MS ? ch : null;
}
