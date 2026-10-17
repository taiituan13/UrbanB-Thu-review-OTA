// Content script (thế giới ISOLATED) của "UrbanB tại quầy" trên PMS ezCloud và HA Go2Joy.
//
// - Nhận token Bearer mà capture.js (thế giới MAIN) thấy trang gửi, chuyển cho service worker
//   (quay/sw.js) để gửi về Apps Script của khách sạn. Service worker đọc mã khách sạn ezCloud trong
//   token PMS và trả lại, để khung biết PMS đang mở cơ sở nào.
// - Không thấy request nào mang token sau 10 giây ⇒ đọc JWT trong bộ nhớ trang (userscript 3.2.0 làm y vậy).
// - Trên PMS: nạp khung (quay/boot.js).
//
// Tin từ trang được kiểm nguồn (`event.source === window`) và kiểu dữ liệu; một script lạ trên trang
// có thể giả tin này, nhưng token giả bị Apps Script từ chối (18_TokenPush.js thử token trước khi lưu),
// còn mã khách sạn giả chỉ đổi cơ sở mà khung HỎI Hub — Hub vẫn kẹp theo cơ sở người đăng nhập được gán.
(() => {
  if (globalThis.__urbanbQuayBridge) return;
  const kind = location.hostname === "pms.ezcloudhotel.com" ? "ezcloud" : location.hostname === "ha.go2joy.vn" ? "go2joy" : null;
  if (!kind) return;
  const STORAGE_FALLBACK_MS = 10000; // quay/booking-ota.js STORAGE_FALLBACK_MS
  const listeners = new Set();
  const bridge = (globalThis.__urbanbQuayBridge = {
    hotelId: "",
    onHotel(fn) {
      listeners.add(fn);
    },
  });
  let captured = false;

  const setHotel = (id) => {
    if (!id || id === bridge.hotelId) return;
    bridge.hotelId = id;
    for (const fn of listeners) {
      try {
        fn(id);
      } catch {}
    }
  };
  const push = (token, hotelSn, quiet) => {
    try {
      chrome.runtime.sendMessage({ type: "quay:token", kind, token, hotelSn, quiet }, (r) => {
        void chrome.runtime.lastError;
        if (r?.hotelId) setHotel(r.hotelId);
      });
    } catch {}
  };

  window.addEventListener("message", (e) => {
    if (e.source !== window) return;
    const d = e.data;
    if (!d || d.__urbanbQuay !== "auth" || d.kind !== kind || typeof d.token !== "string" || !d.token) return;
    captured = true;
    push(d.token, Number(d.hotelSn) || 0, false);
  });

  setTimeout(async () => {
    if (captured) return;
    try {
      const B = await import(chrome.runtime.getURL("quay/booking-ota.js"));
      const token = B.findJwtIn([localStorage, sessionStorage]);
      if (token) push(token, 0, true);
    } catch {}
  }, STORAGE_FALLBACK_MS);

  try {
    chrome.runtime.sendMessage({ type: "quay:tabHotel" }, (r) => {
      void chrome.runtime.lastError;
      if (r?.hotelId) setHotel(r.hotelId);
    });
  } catch {}

  if (kind !== "ezcloud") return;
  const go = () =>
    import(chrome.runtime.getURL("quay/boot.js"))
      .then((m) => m.boot(bridge))
      .catch((e) => console.warn("[UrbanB tại quầy] không nạp được khung:", e?.message ?? e));
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go, { once: true });
  else go();
})();
