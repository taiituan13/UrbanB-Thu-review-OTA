// Content script (thế giới ISOLATED) của "UrbanB tại quầy" trên PMS ezCloud và HA Go2Joy.
//
// - Nhận token Bearer mà capture.js (thế giới MAIN) thấy trang gửi, chuyển cho service worker
//   (quay/sw.js) để gửi về Apps Script của khách sạn. Service worker đọc mã khách sạn ezCloud trong
//   token PMS và trả lại, để khung biết PMS đang mở cơ sở nào.
// - Không thấy request nào mang token sau 10 giây ⇒ đọc JWT trong bộ nhớ trang (userscript 3.2.0 làm y vậy).
// - PMS từ 10/2026 không còn gửi Bearer (YC-152 làn yc152-ma-ks) ⇒ mã khách sạn đọc thêm từ tiêu đề tab
//   PMS "ezCloudHotel <mã KS> - …", chính PMS ghi theo cơ sở đang chọn. Đường token giữ nguyên cho bản PMS cũ.
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
    if (kind === "ezcloud" && d && d.__urbanbQuay === "shiftHandover") return void onShiftHandover(d);
    if (!d || d.__urbanbQuay !== "auth" || d.kind !== kind || typeof d.token !== "string" || !d.token) return;
    captured = true;
    push(d.token, Number(d.hotelSn) || 0, false);
  });

  // YC-246 (H-2034 b) — lễ tân bấm Bàn giao trên PMS: chỉ khi ezCloud báo xong mới dựng thân tin (số và mã,
  // quay/shift-handover.js) rồi gửi service worker. Thân request của PMS không rời trang.
  const onShiftHandover = async (d) => {
    try {
      if (typeof d.body !== "string" || typeof d.response !== "string") return;
      const S = await import(chrome.runtime.getURL("quay/shift-handover.js"));
      if (!S.ezcloudSucceeded(d.status, d.response)) return;
      const report = S.handoverReport({
        requestBody: d.body,
        handedOverAt: new Date().toISOString(),
        extensionVersion: chrome.runtime.getManifest().version,
        pageHotelId: bridge.hotelId,
      });
      if (!report) return;
      chrome.runtime.sendMessage({ type: "quay:shiftHandover", report }, () => void chrome.runtime.lastError);
    } catch {}
  };

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

  // Tiêu đề tab PMS: "ezCloudHotel 15739 - 67 - <tài khoản>" (đo 20/10/2026; 15739 = ezcloudHotelId của COL
  // trong ezcloud-ota-booking-sync/hotels/COL.json). Chỉ nhận đúng dạng này. Tiêu đề đổi khi đổi cơ sở
  // mà không tải lại trang ⇒ đọc lại mỗi 2 giây (chỉ so chuỗi, không gọi gì khi mã không đổi).
  const TITLE_HOTEL_RE = /^\s*ezCloudHotel\s+(\d{3,9})\s+-\s/i;
  // YC-192: đoạn giữa là TÊN khách sạn trên ezCloud (production 24/10: mã 15739 tên "67"); tên có thể chứa " - "
  // ("TRẦN LONG - QUẬN 12") nên tên = mọi đoạn trừ đoạn cuối (tài khoản). Chỉ một đoạn ⇒ coi là tên.
  const titleName = (title) => {
    const parts = String(title).replace(TITLE_HOTEL_RE, "").split(" - ");
    return (parts.length > 1 ? parts.slice(0, -1).join(" - ") : parts[0]).trim().slice(0, 200);
  };
  let titleHotel = "";
  const readTitle = () => {
    const title = String(document.title ?? "");
    const id = (title.match(TITLE_HOTEL_RE) || [])[1] || "";
    if (!id) return;
    const key = id + "|" + titleName(title);
    if (key === titleHotel) return;
    titleHotel = key;
    setHotel(id);
    try {
      chrome.runtime.sendMessage({ type: "quay:pageHotel", hotelId: id, hotelName: titleName(title) }, () => void chrome.runtime.lastError);
    } catch {}
  };
  readTitle();
  setInterval(readTitle, 2000);

  const go = () =>
    import(chrome.runtime.getURL("quay/boot.js"))
      .then((m) => m.boot(bridge))
      .catch((e) => console.warn("[Urban B] không nạp được khung:", e?.message ?? e));
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go, { once: true });
  else go();
})();
