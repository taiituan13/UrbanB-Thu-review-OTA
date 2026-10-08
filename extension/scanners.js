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

/**
 * Traveloka — chạy trên tera.traveloka.com/…/guest-review/ (đo 08/10/2026).
 * Dùng lại request getHotelReviews mà trang đã gửi (capture.js ghi lại), chỉ đổi bộ lọc và phân trang.
 */
export async function scanTravelokaInPage() {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let cap = null;
  for (let i = 0; i < 60 && !cap; i++) {
    cap = window.__urbanbCap?.traveloka;
    if (!cap) await sleep(500);
  }
  if (!cap) return { ok: false, error: "Không bắt được request review của trang Traveloka" };

  const template = JSON.parse(cap.init.body);
  const pageSize = 10; // trang tự dùng 10; xin nhiều hơn vẫn được, nhưng chưa đo được trần
  const reviews = [];
  let total = null;
  let aggregate = null;
  for (let skip = 0; skip < 5000; skip += pageSize) {
    const body = structuredClone(template);
    body.data.top = pageSize;
    body.data.skip = skip;
    // filterType null = tất cả (kể cả bài chỉ chấm điểm); giá trị khác "null" như "ALL" bị trả 400.
    body.data.filterSortSpec = { filterType: null, dateRangeStart: null, dateRangeEnd: null, sortType: "NEWEST_TIMESTAMP" };
    const res = await fetch(cap.url, { ...cap.init, body: JSON.stringify(body) });
    if (!res.ok) return { ok: false, error: `Traveloka HTTP ${res.status}` };
    const j = await res.json();
    const d = j.data ?? {};
    const page = d.reviewList ?? [];
    total = Number(d.numReviewEntries ?? total);
    aggregate = aggregate ?? d.aggregateInfo ?? null;
    reviews.push(...page);
    if (page.length < pageSize || (Number.isFinite(total) && reviews.length >= total)) break;
    await sleep(800);
  }

  const snapshots = [];
  if (aggregate) {
    const n = Number(aggregate.numOfReviews);
    const add = (code, name, value) => {
      const s = Number(value);
      if (Number.isFinite(s)) snapshots.push({ category: name, categoryCode: code, score: s, scale: 10, reviewCount: n });
    };
    add("overall", "Tổng", aggregate.overallScore);
    add("cleanliness", "Sạch sẽ", aggregate.cleanlinessScore);
    add("comfort", "Thoải mái", aggregate.comfortScore);
    add("service", "Dịch vụ", aggregate.serviceScore);
    add("food", "Đồ ăn", aggregate.foodScore);
    add("location", "Vị trí", aggregate.locationScore);
  }
  return { ok: true, total, reviews, channelHotelId: String(template.data?.hotelId ?? ""), snapshots };
}

/**
 * Expedia — chạy trên apps.expediapartnercentral.com/supply/reviews/post-stay-reviews (đo 08/10/2026).
 * GraphQL persisted query SupplyReviewsQuery; dùng lại request của trang, bỏ bộ lọc, lật từng trang.
 * Ép locale en_US để chữ ngày/điểm luôn cùng một dạng cho bộ chuẩn hoá.
 */
export async function scanExpediaInPage() {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let cap = null;
  for (let i = 0; i < 60 && !cap; i++) {
    cap = window.__urbanbCap?.expedia;
    if (!cap) await sleep(500);
  }
  if (!cap) return { ok: false, error: "Không bắt được request review của trang Expedia" };

  const template = JSON.parse(cap.init.body);
  const ops = Array.isArray(template) ? template : [template];
  const op = ops.find((o) => o.operationName === "SupplyReviewsQuery");
  if (!op) return { ok: false, error: "Request Expedia không có SupplyReviewsQuery" };
  const propertyId = String(op.variables?.propertyContext?.propertyId ?? "");

  const reviews = [];
  let totalPages = 1;
  let insight = null;
  for (let page = 1; page <= totalPages && page < 200; page++) {
    const body = structuredClone(template);
    const target = (Array.isArray(body) ? body : [body]).find((o) => o.operationName === "SupplyReviewsQuery");
    target.variables.reviewsContext = { ...target.variables.reviewsContext, filters: [], page };
    target.variables.reviewId = "";
    if (target.variables.context) target.variables.context.locale = "en_US";
    const res = await fetch(cap.url, { ...cap.init, body: JSON.stringify(body) });
    if (!res.ok) return { ok: false, error: `Expedia HTTP ${res.status}` };
    const j = await res.json();
    const one = Array.isArray(j) ? j[0] : j;
    if (one.errors?.length) return { ok: false, error: "Expedia báo lỗi: " + one.errors.map((e) => e.message).join("; ").slice(0, 300) };
    const d = one.data?.supplyReviews ?? {};
    reviews.push(...(d.list ?? []));
    totalPages = Number(d.pagination?.totalPages ?? 1) || 1;
    insight = insight ?? d.insightsSecondaryPane?.modules?.find((m) => m?.overAllRating != null) ?? null;
    if (page < totalPages) await sleep(800);
  }

  const snapshots = [];
  let total = null;
  if (insight) {
    const s = Number(String(insight.overAllRating).replace(",", "."));
    const n = Number(String(insight.totalReviews ?? "").match(/\d+/)?.[0]);
    if (Number.isFinite(n)) total = n;
    if (Number.isFinite(s)) snapshots.push({ category: "Tổng", categoryCode: "overall", score: s, scale: 10, reviewCount: total ?? "" });
  }
  return { ok: true, total, reviews, channelHotelId: propertyId, snapshots };
}

/** Booking — trên trang chủ (nhóm hoặc một chỗ nghỉ): lấy ses và danh sách mã chỗ nghỉ thấy được. */
export function bookingSessionInPage() {
  const ses = new URLSearchParams(location.search).get("ses");
  const ids = [...document.body.innerText.matchAll(/(?:^|\n)(\d{7,9})\t/g)].map((m) => m[1]);
  const single = new URLSearchParams(location.search).get("hotel_id");
  return { ses, propertyIds: single ? [single] : [...new Set(ids)] };
}
