// Mở trang trong tab nền và chạy bộ quét trên đó: phần thuần, test được ngoài Chrome.
//
// Đo 09/10/2026 trên Chromium (lỗi E-48868G, Linh Đan Hotel Phú Nhuận): extension mở tab trống
// (about:blank) rồi cho nó đi tới extranet. Lượt mở bị dừng (người dùng bấm ✕/Esc trên tab trắng)
// hoặc bị huỷ (trang trả 204, thành lượt tải tệp, bị chặn) thì tab ĐỨNG YÊN ở about:blank mà Chrome
// vẫn báo "tải xong" ngay. Bộ quét chạy trên trang trống ⇒ Chrome báo câu khó hiểu
// `Cannot access contents of url "about:blank"`. Mất mạng thì Chrome hiện trang lỗi của nó:
// `Frame with ID 0 is showing error page`. Đóng tab lúc đang tải thì trước đây phải chờ 45 giây
// rồi báo nhầm "Hết giờ chờ trang tải".

/** Tab chưa rời trang trống: lượt mở chưa hề tới được trang đích. */
export function isBlankTab(url) {
  const u = String(url ?? "");
  return u === "" || u.startsWith("about:");
}

/** Tên miền để đặt vào câu lỗi; URL hỏng ⇒ "trang đích". Không bao giờ trả query (ses của Booking). */
export function hostOf(url) {
  try {
    return new URL(url).hostname || "trang đích";
  } catch {
    return "trang đích";
  }
}

/** Câu lỗi khi tab vẫn trống sau khi đã mở lại; khớp loại OPEN trong report.js. */
export function blankTabMessage(url) {
  return `Chưa mở được ${hostOf(url)}: lượt mở bị dừng hoặc bị chặn, tab vẫn trống`;
}

/** Câu lỗi khi tab bị đóng lúc trang đang tải; khớp loại TAB trong report.js. */
export const TAB_CLOSED_MESSAGE = "Tab bị đóng giữa lúc tải trang";

/**
 * Đổi câu lỗi của chrome.scripting.executeScript thành câu đọc được. `tabUrl` = URL tab đang đứng.
 * Câu chưa biết thì giữ nguyên để loại SCAN còn thấy nguyên văn.
 */
export function explainInjectError(message, tabUrl) {
  const m = String(message ?? "");
  if (/showing error page/i.test(m)) return `Trang ${hostOf(tabUrl)} không tải được (mất mạng hoặc bị chặn)`;
  if (/Cannot access contents of url/i.test(m)) {
    return isBlankTab(tabUrl) ? blankTabMessage(tabUrl) : `Tab chuyển sang ${hostOf(tabUrl)} giữa lượt quét`;
  }
  return m;
}
