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
