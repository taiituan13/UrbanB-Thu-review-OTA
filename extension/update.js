// Tự cập nhật cho bản cài giải nén (không qua Chrome Web Store).
//
// Trên máy Windows của khách sạn, chạy lại windows/cai-dat.ps1 là chép bản mới từ GitHub đè
// lên thư mục extension. (Tác vụ hẹn giờ tự chạy lệnh đó đã tạm bỏ 08/10/2026.) Chrome không
// tự nạp lại bản giải nén khi tệp trên đĩa đổi, nên background.js định kỳ đọc manifest.json
// trên đĩa, so với bản đang chạy, và tự gọi chrome.runtime.reload() khi trên đĩa mới hơn.
//
// Đo ngày 08/10/2026 trên Chromium với chế độ nhà phát triển bật: reload() nạp mã mới từ đĩa,
// onInstalled báo reason "update", extension vẫn là UNPACKED và không bị tắt. Tắt chế độ nhà
// phát triển thì Chrome tắt luôn extension (DISABLE_UNSUPPORTED_DEVELOPER_EXTENSION).
//
// Extension không tự chạy được PowerShell, nên nó chỉ BÁO: đọc số phiên bản trên GitHub, mới hơn
// bản đang chạy thì ô bật lên hiện dải "Có bản mới" kèm lệnh cài để chép (từ 0.8.1). GitHub raw
// trả Access-Control-Allow-Origin: * (đo 09/10/2026) nên không phải xin thêm host_permissions.

export const REPO = "taiituan13/UrbanB-Thu-review-OTA";

/** manifest.json của nhánh main: nguồn số phiên bản mới nhất. GitHub giữ bộ đệm 5 phút. */
export const REMOTE_MANIFEST_URL = `https://raw.githubusercontent.com/${REPO}/main/extension/manifest.json`;

/** Lệnh cài và cập nhật trên Windows; trùng nguyên văn với windows/cai-dat.ps1 và docs/cai-tu-xa.md. */
export const UPDATE_COMMAND = `irm https://raw.githubusercontent.com/${REPO}/main/windows/cai-dat.ps1 | iex`;

/** "0.10.0" > "0.9.3". Phần không phải số (ví dụ "-thu") bị bỏ qua. */
export function isNewer(candidate, current) {
  const parts = (v) => String(v ?? "").split(".").map((x) => parseInt(x, 10) || 0);
  const a = parts(candidate);
  const b = parts(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d) return d > 0;
  }
  return false;
}

/** Đọc số phiên bản từ nội dung manifest.json tải về; hỏng hay sai dạng ⇒ null. */
export function parseRemoteVersion(text) {
  try {
    const v = JSON.parse(text)?.version;
    return typeof v === "string" && /^\d+(\.\d+)*$/.test(v) ? v : null;
  } catch {
    return null;
  }
}

/** Dải "Có bản mới" trong ô bật lên: chỉ khi bản trên GitHub mới hơn bản đang chạy. */
export function updateNotice(remote, current) {
  return remote?.latest && isNewer(remote.latest, current) ? { latest: remote.latest, current } : null;
}
