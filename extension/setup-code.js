// Mã cài đặt: một chuỗi gộp tên khách sạn, URL Web App, mã bí mật và các kênh, để người cài
// dán vào một ô thay vì gõ tay chuỗi bí mật 64 ký tự. Người quản lý tạo mã trong Sheet
// (menu Review OTA › Tạo mã cài đặt, hàm setupCodeMenu trong Code.gs).
//
// Dạng: "UBR1-" + base64 an toàn cho URL (có thể còn dấu "=") của JSON UTF-8
// { v: 1, hotel, sheetUrl, secret, channels: [...] }.
// Mã chứa mã bí mật: chỉ gửi riêng cho từng khách sạn, không đưa vào git.

export const SETUP_CODE_PREFIX = "UBR1-";

const URL_RE = /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/;

/**
 * Đọc mã cài đặt. Trả { hotel, sheetUrl, secret, enabled } với enabled có đủ mọi kênh trong
 * `channels` (kênh không có trong mã ⇒ tắt). Mã hỏng ⇒ ném Error với câu đọc được.
 */
export function parseSetupCode(text, channels) {
  const raw = String(text ?? "").replace(/\s+/g, "");
  if (!raw.startsWith(SETUP_CODE_PREFIX)) throw new Error(`Mã cài đặt phải bắt đầu bằng ${SETUP_CODE_PREFIX}`);
  let data;
  try {
    const b64 = raw.slice(SETUP_CODE_PREFIX.length).replace(/-/g, "+").replace(/_/g, "/");
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    data = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new Error("Mã cài đặt bị thiếu hoặc chép sai. Chép lại nguyên chuỗi.");
  }
  if (data?.v !== 1) throw new Error("Mã cài đặt thuộc phiên bản khác. Cập nhật extension hoặc xin mã mới.");
  const hotel = String(data.hotel ?? "").trim();
  if (!hotel) throw new Error("Mã cài đặt thiếu tên khách sạn.");
  if (!URL_RE.test(String(data.sheetUrl ?? ""))) throw new Error("Mã cài đặt có URL Web App sai dạng.");
  if (!data.secret) throw new Error("Mã cài đặt thiếu mã bí mật.");
  const list = Array.isArray(data.channels) ? data.channels : [];
  const unknown = list.filter((ch) => !channels.includes(ch));
  if (unknown.length) throw new Error(`Mã cài đặt có kênh mà bản extension này chưa biết: ${unknown.join(", ")}. Cập nhật extension.`);
  if (!list.length) throw new Error("Mã cài đặt không bật kênh nào.");
  return {
    hotel,
    sheetUrl: data.sheetUrl,
    secret: String(data.secret),
    enabled: Object.fromEntries(channels.map((ch) => [ch, list.includes(ch)])),
  };
}
