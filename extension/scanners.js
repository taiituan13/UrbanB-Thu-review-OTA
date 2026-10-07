// Hàm quét chạy TRONG trang extranet (world "MAIN"), bằng phiên đăng nhập của chính trang.
//
// ☠️ Mỗi hàm phải tự đứng được: chrome.scripting.executeScript chép thân hàm sang trang,
// nên không được tham chiếu biến hay hàm nào ngoài thân nó.
// Chỉ đọc: chỉ gọi API liệt kê review; không gọi API trả lời hay sửa gì.
// Endpoint đo ngày 07/10/2026.

/** Booking — chạy trên trang reviews.html?hotel_id=…&ses=… */
export async function scanBookingInPage() {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // Lấy URL đầy đủ từ chính request của trang (nó mang hotel_account_id mà ta không cần biết).
  let template = null;
  for (let i = 0; i < 40 && !template; i++) {
    template = performance
      .getEntriesByType("resource")
      .map((e) => e.name)
      .find((n) => n.includes("/fresa/extranet/review/fetch_reviews"));
    if (!template) await sleep(500);
  }
  if (!template) return { ok: false, error: "Không thấy request danh sách review của trang Booking" };

  const url = new URL(template);
  const rows = 100;
  url.searchParams.set("rows", String(rows));
  url.searchParams.set("only_without_replies", "0");
  url.searchParams.set("only_with_comments", "0");
  url.searchParams.set("search_term", "");
  const reviews = [];
  let total = null;
  for (let offset = 0; offset < 10000; offset += rows) {
    url.searchParams.set("offset", String(offset));
    const res = await fetch(url, { credentials: "include" });
    const body = await res.text();
    if (!body.startsWith("{")) return { ok: false, error: `Booking trả về không phải JSON (HTTP ${res.status})` };
    const j = JSON.parse(body);
    if (!j.success) return { ok: false, error: "Booking báo lỗi: " + JSON.stringify(j.params?.errors ?? []) };
    const page = j.data?.reviews ?? [];
    total = j.data?.totalCount ?? total;
    reviews.push(...page);
    if (page.length < rows || (total != null && reviews.length >= total)) break;
    await sleep(800);
  }
  const hotelId = url.searchParams.get("hotel_id");
  return { ok: true, total, reviews, channelHotelId: hotelId, snapshots: [] };
}

/** Agoda — chạy trên trang …/app/setting/review/{propertyId} */
export async function scanAgodaInPage(propertyId) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const locale = location.pathname.split("/")[2] || "vi-vn";
  const base = `/mldc/${locale}/api/setting/Review`;
  const pageSize = 200;
  const reviews = [];
  let total = null;
  for (let pageNumber = 1; pageNumber < 50; pageNumber++) {
    const res = await fetch(`${base}/searchreviews/${propertyId}`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pageNumber, pageSize, searchText: null, countries: [], guestTypes: [], roomTypes: [], scores: [] }),
    });
    if (!res.ok) return { ok: false, error: `Agoda HTTP ${res.status}` };
    const j = await res.json();
    const page = j.reviews ?? [];
    if (Array.isArray(j.reviewsCount)) total = j.reviewsCount.reduce((s, c) => s + (c.count || 0), 0);
    reviews.push(...page);
    if (page.length < pageSize || (total != null && reviews.length >= total)) break;
    await sleep(800);
  }

  // Điểm hạng mục mức khách sạn (Agoda không có điểm hạng mục cho từng bài).
  const snapshots = [];
  try {
    const s = await (await fetch(`${base}/score/${propertyId}`, { credentials: "include" })).json();
    const g = s.group ?? {};
    snapshots.push({ category: "Tổng", categoryCode: "overall", score: g.score, scale: g.maxScore, reviewCount: g.reviewCount });
    for (const grade of g.grades ?? []) {
      snapshots.push({ category: grade.name, categoryCode: grade.identifier, score: grade.score, scale: grade.maxScore, reviewCount: g.reviewCount });
    }
  } catch (e) {
    // Thiếu điểm tổng hợp không làm hỏng lượt quét review.
  }
  return { ok: true, total, reviews, channelHotelId: String(propertyId), snapshots };
}

/** Trip — chạy trên trang ebooking.trip.com/comment/commentList */
export async function scanTripInPage() {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // Thân tối giản chạy được, không cần reqHead/rmsToken (đo 07/10/2026).
  const body = {
    keyWord: "", commentStatus: "", isNeedTranslate: false, sortType: 0,
    catalogTab: "all", catalogName: "", needOrder: true, endDate: "", startDate: "",
    channelSource: "1", // 1 = Trip.com; Qunar/Ly.com chưa đo
  };
  const pageSize = 100;
  const reviews = [];
  let total = null;
  let masterHotelId = "";
  for (let pageIndex = 1; pageIndex < 50; pageIndex++) {
    const res = await fetch("/restapi/soa2/26353/getCommentList", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body, pageIndex, pageSize }),
    });
    if (!res.ok) return { ok: false, error: `Trip HTTP ${res.status}` };
    const j = await res.json();
    if (j.ResponseStatus?.Ack !== "Success") return { ok: false, error: "Trip báo lỗi: " + JSON.stringify(j.ResponseStatus?.Errors ?? []) };
    const page = j.commentlist ?? [];
    total = j.commentCount ?? total;
    masterHotelId = String(j.masterHotelId ?? masterHotelId);
    reviews.push(...page);
    if (page.length < pageSize || (total != null && reviews.length >= total)) break;
    await sleep(800);
  }
  return { ok: true, total, reviews, channelHotelId: masterHotelId, snapshots: [] };
}

/** Booking — trên trang chủ (nhóm hoặc một chỗ nghỉ): lấy ses và danh sách mã chỗ nghỉ thấy được. */
export function bookingSessionInPage() {
  const ses = new URLSearchParams(location.search).get("ses");
  const ids = [...document.body.innerText.matchAll(/(?:^|\n)(\d{7,9})\t/g)].map((m) => m[1]);
  const single = new URLSearchParams(location.search).get("hotel_id");
  return { ses, propertyIds: single ? [single] : [...new Set(ids)] };
}
