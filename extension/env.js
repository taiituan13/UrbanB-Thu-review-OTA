// Hằng môi trường của extension "UrbanB tại quầy". Bản cài cho máy quầy dùng đúng tệp này.
// Bản dựng để đo (tools/do-quay/) ghi đè tệp này trong một bản chép riêng, không sửa tệp gốc.

/** Các gốc Hub mà extension được phép gọi bằng phiên đăng nhập (manifest có host_permissions tương ứng). */
export const HUB_ORIGINS = ["https://hub.urbanb.vn", "https://urbanb.xyz"];

/** Gốc Hub mặc định cho máy quầy (production). */
export const DEFAULT_HUB_ORIGIN = "https://hub.urbanb.vn";

/** Nhãn cho ô chọn Hub trong popup. */
export const HUB_LABELS = { "https://hub.urbanb.vn": "hub.urbanb.vn", "https://urbanb.xyz": "urbanb.xyz (bãi thử)" };

/** Mẫu URL Web App Apps Script mà Booking OTA được gọi tới. URL khác mẫu này bị từ chối, không gọi. */
export const APPS_SCRIPT_URL_RE = /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/;

/**
 * Cờ chỉ dành cho bản dựng đo. Bản cài thật để `false`.
 * `fakeNotifications`: dùng nguồn thông báo giả (quay/notifications.js) thay cho route Hub chưa có.
 */
export const DEV_FLAGS = { fakeNotifications: false };
