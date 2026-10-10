// Mã cài đặt: cả khối Cài đặt của một khách sạn gói trong một chuỗi, để cài từ xa không phải đọc
// cho người cài từng ô (từ 0.9.0).
//
// Người quản lý tạo mã trong Sheet (menu Review OTA › Tạo lệnh cài cho khách sạn, Code.gs). Mã đi
// tới máy theo một trong hai đường:
//   - lệnh cài `$UrbanBMa='URB1…'; irm …/cai-dat.ps1 | iex`: cai-dat.ps1 ghi mã vào tệp
//     ma-cai-dat.txt trong thư mục extension, extension tự đọc lúc nạp, mỗi 30 phút và khi mở ô;
//   - dán vào ô "Mã cài đặt" trong khối Cài đặt.
//
// Dạng mã: "URB1." + base64url(JSON UTF-8). Mã chứa mã bí mật Sheet và token Hub, nên gửi riêng
// như gửi mã bí mật trước đây. Mã mang đủ cài đặt: ô nào mã để trống thì áp vào cũng thành trống.

import { CHANNELS } from "./config.js";

export const SETUP_PREFIX = "URB1.";

/** Tệp cai-dat.ps1 ghi mã vào, nằm trong thư mục extension (robocopy /MIR chừa tệp này ra). */
export const SETUP_FILE = "ma-cai-dat.txt";

const TEXT_FIELDS = ["hotel", "sheetUrl", "secret", "hubUrl", "hubToken", "bookingHotelId", "agodaPropertyId", "expediaPropertyId"];

function toBase64Url(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text) {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** Dùng trong test và để đối chiếu với Code.gs; Sheet tự mã hoá bằng Utilities của Google. */
export function encodeSetupCode(setup) {
  return SETUP_PREFIX + toBase64Url(JSON.stringify({ v: 1, ...setup }));
}

/**
 * Đọc mã; sai thì ném lỗi có câu tiếng Việt để hiện cho người cài.
 * Chịu được khoảng trắng, xuống dòng và dấu = do chép dán.
 */
export function decodeSetupCode(text) {
  const raw = String(text ?? "").replace(/\s+/g, "");
  if (!raw.startsWith(SETUP_PREFIX)) throw new Error(`Mã cài đặt phải bắt đầu bằng ${SETUP_PREFIX}`);
  let data;
  try {
    data = JSON.parse(fromBase64Url(raw.slice(SETUP_PREFIX.length).replace(/=+$/, "")));
  } catch {
    throw new Error("Mã cài đặt bị cắt hoặc chép sai. Chép lại nguyên dòng.");
  }
  if (data?.v !== 1) throw new Error("Mã cài đặt của bản extension khác. Cập nhật extension rồi thử lại.");
  const setup = {};
  for (const f of TEXT_FIELDS) setup[f] = typeof data[f] === "string" ? data[f].trim() : "";
  if (!setup.hotel) throw new Error("Mã cài đặt thiếu tên khách sạn.");
  if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(setup.sheetUrl)) throw new Error("Mã cài đặt có URL Sheet không đúng dạng …/exec.");
  if (!setup.secret) throw new Error("Mã cài đặt thiếu mã bí mật.");
  const channels = Array.isArray(data.channels) ? data.channels.filter((ch) => CHANNELS.includes(ch)) : [];
  if (!channels.length) throw new Error("Mã cài đặt chưa chọn kênh nào.");
  setup.channels = channels;
  return setup;
}

/** Cấu hình mới sau khi áp mã: mọi ô theo mã, kênh không có trong mã thì tắt; chu kỳ quét giữ nguyên. */
export function applySetup(cfg, setup) {
  const next = { ...cfg, enabled: {} };
  for (const f of TEXT_FIELDS) next[f] = setup[f] ?? "";
  for (const ch of CHANNELS) next.enabled[ch] = setup.channels.includes(ch);
  return next;
}
