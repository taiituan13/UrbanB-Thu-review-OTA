// Chạy trong trang (world MAIN) ngay khi trang bắt đầu tải, trên Traveloka, Expedia, Go2Joy và PMS ezCloud.
//
// Các kênh này gửi request review kèm nhiều header đăng nhập mà extension không tự dựng lại
// được (Traveloka: Authorization, x-hnet-*, x-aws-waf-token; Go2Joy: Authorization, Version…).
// Cách làm: ghi lại request mà CHÍNH TRANG gửi, rồi hàm quét dùng lại nó và chỉ đổi phần
// phân trang. Go2Joy gửi qua XMLHttpRequest (axios), hai kênh kia qua fetch ⇒ bắt cả hai đường.
// Chỉ ghi lại, không sửa request nào; dữ liệu ghi lại nằm trong trang, không gửi đi đâu.
//
// "UrbanB tại quầy" (Booking OTA): trên PMS ezCloud và HA Go2Joy, token Bearer mà CHÍNH TRANG gửi tới
// API của nó được chuyển cho bridge.js (thế giới ISOLATED) bằng window.postMessage, để service worker
// gửi về Apps Script của khách sạn — đúng việc userscript EZCloud OTA Sync 3.2.0 đang làm. Chỉ chuyển
// khi token (hoặc hotelSn của Go2Joy) đổi, không chuyển mỗi request.

(() => {
  if (window.__urbanbCapInstalled) return;
  window.__urbanbCapInstalled = true;
  window.__urbanbCap = {};
  const PATTERNS = [
    ["traveloka", (url) => url.includes("/review/getHotelReviews")],
    ["expedia", (url, body) => url.includes("/graphql") && typeof body === "string" && body.includes("SupplyReviewsQuery")],
    ["go2joy", (url) => url.includes("/hotel/getUserReviewList")],
  ];
  const record = (url, init) => {
    for (const [key, match] of PATTERNS) {
      if (match(url, init?.body)) window.__urbanbCap[key] = { url, init };
    }
  };
  const AUTH_KIND = location.hostname === "pms.ezcloudhotel.com" ? "ezcloud" : location.hostname === "ha.go2joy.vn" ? "go2joy" : null;
  const isAuthApi = (url) => {
    try {
      const u = new URL(url, location.href);
      if (AUTH_KIND === "ezcloud") return u.hostname === "pms.ezcloudhotel.com" && u.pathname.startsWith("/api/");
      if (AUTH_KIND === "go2joy") return u.hostname === "api-ha.go2joy.vn";
    } catch {}
    return false;
  };
  let lastAuth = "";
  const seeAuth = (url, auth, body) => {
    if (!AUTH_KIND || !auth || !isAuthApi(url)) return;
    const m = String(auth).match(/^Bearer\s+(\S+)/i);
    if (!m) return;
    let hotelSn = 0;
    try {
      hotelSn = Number(new URL(url, location.href).searchParams.get("hotelSn")) || 0;
    } catch {}
    if (!hotelSn && typeof body === "string") {
      const b = body.match(/"hotelSn"\s*:\s*"?(\d+)/);
      if (b) hotelSn = Number(b[1]);
    }
    const sig = m[1] + "|" + hotelSn;
    if (sig === lastAuth) return;
    lastAuth = sig;
    window.postMessage({ __urbanbQuay: "auth", kind: AUTH_KIND, token: m[1], hotelSn }, location.origin);
  };
  const headerOf = (headers) => {
    if (!headers) return "";
    if (typeof headers.get === "function") return headers.get("Authorization") || "";
    if (Array.isArray(headers)) return (headers.find(([k]) => /^authorization$/i.test(k)) || [])[1] || "";
    const key = Object.keys(headers).find((k) => /^authorization$/i.test(k));
    return key ? headers[key] || "" : "";
  };

  const original = window.fetch;
  window.fetch = function (input, init) {
    try {
      const url = typeof input === "string" ? input : input?.url ?? String(input);
      record(url, { ...init });
      if (AUTH_KIND) seeAuth(url, headerOf(init?.headers) || headerOf(input?.headers), init?.body);
    } catch {}
    return original.apply(this, arguments);
  };

  const xhr = XMLHttpRequest.prototype;
  const { open, setRequestHeader, send } = xhr;
  xhr.open = function (method, url) {
    try {
      this.__urbanbReq = { method, url: new URL(String(url), location.href).href, headers: {} };
    } catch {}
    return open.apply(this, arguments);
  };
  xhr.setRequestHeader = function (name, value) {
    if (this.__urbanbReq) this.__urbanbReq.headers[name] = value;
    return setRequestHeader.apply(this, arguments);
  };
  xhr.send = function (body) {
    try {
      const r = this.__urbanbReq;
      if (r) record(r.url, { method: r.method, headers: { ...r.headers }, body: typeof body === "string" ? body : undefined });
      if (r && AUTH_KIND) seeAuth(r.url, headerOf(r.headers), body);
    } catch {}
    return send.apply(this, arguments);
  };
})();
