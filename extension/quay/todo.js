// Tab chính "Cần xử lý" của khung quầy (YC-159, user yêu cầu 20/10/2026): gom trên một màn những thứ
// lễ tân phải làm ngay — booking OTA lỗi và chỉ báo đang vượt. Hai tab còn lại là tra cứu: Booking OTA
// (tìm, danh sách gần đây) và Khoá G2J (bảng khoá 14 ngày).
//
// Trước đây khung có ba tab ngang hàng và luôn mở ở Booking OTA, nên chỉ báo đang vượt nằm khuất ở tab
// thứ ba trong khi nút gập đã báo cả hai việc. Logic thuần, không đọc DOM.

import { hasIssue } from "./booking-ota.js";

/** Thứ tự tab: tab chính đứng đầu. `cb` (Chỉ báo) không còn là tab riêng, đã gộp vào `todo`. */
export const FRAME_TABS = [
  { id: "todo", label: "Cần xử lý" },
  { id: "bookings", label: "Booking OTA" },
  { id: "board", label: "Khoá G2J" },
];

/** Mở khung (bấm nút gập) luôn về tab chính: nút gập báo việc, bấm vào phải thấy đúng việc ấy. */
export const DEFAULT_TAB = "todo";

/**
 * Mô hình tab chính.
 * `recent` = lượt đọc booking GẦN ĐÂY (không phải kết quả tìm: tìm một booking không được làm mất
 * booking lỗi khỏi tab chính). `ind` = `indicatorsModel(...)` hoặc `null` khi chưa đọc được.
 */
export function todoModel({ recent, ind }) {
  const list = recent ? (recent.ok === false ? recent.cached?.matches ?? null : recent.matches ?? null) : null;
  const issues = list ? list.filter(hasIssue) : [];
  const exceeded = ind ? ind.exceeded.length : 0;
  return {
    issues,
    // Đọc booking hỏng mà không có bản lưu: chưa biết có booking lỗi hay không, không được nói "không có".
    bookingsKnown: list !== null,
    exceeded,
    count: issues.length + exceeded,
  };
}
