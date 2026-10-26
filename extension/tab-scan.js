// YC-238 (H-1972 a, H-1973 a) — tab nền mà máy tự mở để đọc review. Phần thuần, test được ngoài Chrome.
//
// Ca thật 26/10/2026 (The Passion Airport, BKG-TAB lúc 10:17): lễ tân không biết tab ấy là của máy nên
// đóng giữa chừng. Nay tab nằm trong một nhóm tab có tên, trang đang đọc có dải chữ dặn đừng đóng, và lỡ
// đóng thì máy tự đọc lại kênh ấy một lần sau 2 phút; lần đọc lại cũng hỏng mới báo lỗi đỏ như cũ.

/** Nhóm tab chứa tab quét. Màu cố định để lễ tân nhận ra trên thanh tab. */
export const SCAN_GROUP = Object.freeze({ title: "Urban B · đang đọc review", color: "blue" });

/** Dải chữ trên đầu trang đang đọc. */
export const BANNER_TEXT = "Urban B đang đọc review trên trang này. Tab sẽ tự đóng khi đọc xong, xin đừng đóng tab.";

/** H-1973 a: tab quét bị đóng giữa chừng ⇒ đọc lại kênh ấy một lần, sau ngần này phút. */
export const TAB_RETRY_MINUTES = 2;

const RETRY_ALARM_PREFIX = "tabRetry:";

/** Tên báo thức đọc lại của một kênh (chrome.alarms: service worker có thể ngủ, không dùng setTimeout). */
export function retryAlarmName(channel) {
  return RETRY_ALARM_PREFIX + channel;
}

/** Kênh của báo thức đọc lại, hoặc `null` nếu không phải báo thức đọc lại. */
export function channelOfRetryAlarm(name) {
  const s = String(name ?? "");
  return s.startsWith(RETRY_ALARM_PREFIX) ? s.slice(RETRY_ALARM_PREFIX.length) || null : null;
}

/**
 * Nhóm quét đang có trong cửa sổ của tab mới (lượt quét nhiều kênh nối nhau dùng chung một nhóm), hoặc
 * `null` để tạo nhóm mới. `groups` = kết quả `chrome.tabGroups.query({ title })`.
 */
export function pickScanGroup(groups, windowId) {
  const g = (groups ?? []).find((x) => x?.title === SCAN_GROUP.title && x.windowId === windowId);
  return g?.id ?? null;
}

/**
 * Kết cục của một lượt đọc hỏng. `closed` = tab quét bị đóng giữa chừng (mã TAB); `pending` = kênh đang chờ
 * đọc lại, tức lượt này chính là lần đọc lại. Trả `{ retry: { closedAt, retryAt } }` khi phải hẹn đọc lại,
 * `{ retry: null }` khi báo lỗi như thường. Mỗi lượt đọc bị đóng chỉ được đọc lại một lần.
 */
export function closedOutcome({ closed, pending, now }) {
  if (!closed || pending) return { retry: null };
  const at = new Date(now);
  return { retry: { closedAt: at.toISOString(), retryAt: new Date(at.getTime() + TAB_RETRY_MINUTES * 60000).toISOString() } };
}

/**
 * Chạy TRONG trang đang đọc (chrome.scripting). Dải chữ cố định ở đầu trang, không bắt chuột (chuột bấm
 * xuyên qua, không che nút của trang). Gắn vào <html> chứ không vào <body> để trang vẽ lại thân không
 * xoá mất. Gọi lại nhiều lần chỉ có một dải.
 */
export function showScanBanner(text) {
  const id = "urbanb-scan-banner";
  if (document.getElementById(id)) return true;
  const el = document.createElement("div");
  el.id = id;
  el.setAttribute("role", "status");
  el.textContent = text;
  el.style.cssText = [
    "all:initial",
    "position:fixed",
    "top:0",
    "left:0",
    "right:0",
    "z-index:2147483647",
    "pointer-events:none",
    "padding:6px 12px",
    "background:rgba(29,78,216,.92)",
    "color:#fff",
    "font:600 13px/1.4 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif",
    "text-align:center",
  ].join(";");
  document.documentElement.appendChild(el);
  return true;
}

/** Hạn chèn dải chữ. Hằng kỹ thuật: quá hạn thì bỏ dải chữ, không chờ thêm. */
export const BANNER_TIMEOUT_MS = 5_000;
