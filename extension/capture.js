// Chạy trong trang (world MAIN) ngay khi trang bắt đầu tải, trên Traveloka và Expedia.
//
// Hai kênh này gửi request review kèm nhiều header đăng nhập mà extension không tự dựng lại
// được (Traveloka: Authorization, x-hnet-*, x-aws-waf-token). Cách làm: ghi lại request mà
// CHÍNH TRANG gửi, rồi hàm quét dùng lại nó và chỉ đổi phần phân trang.
// Chỉ ghi lại, không sửa request nào; dữ liệu ghi lại nằm trong trang, không gửi đi đâu.

(() => {
  if (window.__urbanbCapInstalled) return;
  window.__urbanbCapInstalled = true;
  window.__urbanbCap = {};
  const PATTERNS = [
    ["traveloka", (url) => url.includes("/review/getHotelReviews")],
    ["expedia", (url, body) => url.includes("/graphql") && typeof body === "string" && body.includes("SupplyReviewsQuery")],
  ];
  const original = window.fetch;
  window.fetch = function (input, init) {
    try {
      const url = typeof input === "string" ? input : input?.url ?? String(input);
      const body = init?.body;
      for (const [key, match] of PATTERNS) {
        if (match(url, body)) window.__urbanbCap[key] = { url, init: { ...init } };
      }
    } catch {}
    return original.apply(this, arguments);
  };
})();
