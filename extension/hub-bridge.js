// Content script (thế giới ISOLATED) trên Hub UrbanB (hub.urbanb.vn, urbanb.xyz) — YC-156.
//
// Hợp đồng với trang Hub (làn Hub dựng theo đúng như này; đổi gì phải báo điều phối trước):
// - Chạy là đặt `document.documentElement.dataset.urbanbExt = "<phiên bản>"`: trang biết máy đã cài.
// - Trang gửi `window.postMessage({ source: "urbanb-hub", type: "ext:hello" }, location.origin)`.
//   Tệp này trả (cả lúc vừa nạp, không chờ hỏi)
//   `window.postMessage({ source: "urbanb-ext", type: "ext:status", status }, location.origin)`,
//   `status` theo quay/hub-quay.js extStatusOf. Không có token, mã bí mật, URL Sheet trong tin.
// - Chỉ nhận tin có `event.source === window` và `event.origin === location.origin`.
//
// H-1526 a: trang ở màn Cài extension (`/extension`) ⇒ service worker theo Hub của trang này và đồng bộ
// ngay (quay/sw.js extStatus). Gốc trang service worker tự lấy từ người gửi, không lấy từ tin.
(() => {
  if (globalThis.__urbanbHubBridge) return;
  globalThis.__urbanbHubBridge = true;
  document.documentElement.dataset.urbanbExt = chrome.runtime.getManifest().version;

  const ask = () =>
    new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: "quay:extStatus", path: location.pathname }, (r) => {
          void chrome.runtime.lastError;
          resolve(r?.ok ? r.status : null);
        });
      } catch {
        resolve(null); // extension vừa nạp lại: trang cũ mất kết nối với service worker
      }
    });

  // Một lượt hỏi một lúc. Trang hỏi trong lúc đang hỏi (ví dụ vừa chuyển sang /extension) ⇒ hỏi thêm một lượt.
  let busy = false;
  let again = false;
  async function answer() {
    if (busy) {
      again = true;
      return;
    }
    busy = true;
    try {
      do {
        again = false;
        const status = await ask();
        if (status) window.postMessage({ source: "urbanb-ext", type: "ext:status", status }, location.origin);
      } while (again);
    } finally {
      busy = false;
    }
  }

  window.addEventListener("message", (e) => {
    if (e.source !== window || e.origin !== location.origin) return;
    const d = e.data;
    if (!d || d.source !== "urbanb-hub" || d.type !== "ext:hello") return;
    answer();
  });
  answer();
})();
