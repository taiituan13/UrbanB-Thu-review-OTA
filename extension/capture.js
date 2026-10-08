// Chạy trong trang (world MAIN) ngay khi trang bắt đầu tải, trên Traveloka, Expedia và Go2Joy.
//
// Các kênh này gửi request review kèm nhiều header đăng nhập mà extension không tự dựng lại
// được (Traveloka: Authorization, x-hnet-*, x-aws-waf-token; Go2Joy: Authorization, Version…).
// Cách làm: ghi lại request mà CHÍNH TRANG gửi, rồi hàm quét dùng lại nó và chỉ đổi phần
// phân trang. Go2Joy gửi qua XMLHttpRequest (axios), hai kênh kia qua fetch ⇒ bắt cả hai đường.
// Chỉ ghi lại, không sửa request nào; dữ liệu ghi lại nằm trong trang, không gửi đi đâu.

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
  const original = window.fetch;
  window.fetch = function (input, init) {
    try {
      const url = typeof input === "string" ? input : input?.url ?? String(input);
      record(url, { ...init });
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
    } catch {}
    return send.apply(this, arguments);
  };
})();
