// Chuẩn hoá review thô của từng kênh thành dòng cho Google Sheet.
//
// Hàm thuần: không gọi mạng, không đọc chrome.*. Dùng chung cho extension và test.
// Dạng trường lấy từ phép đo extranet ngày 07/10/2026 (Secret Garden Bình Thạnh).

/** Trường chứa tên khách hoặc mã bí mật — bị gỡ khỏi JSON gốc trước khi gửi đi. */
const STRIP_FIELDS = {
  booking: ["name", "yourname"],
  agoda: ["reviewer", "memberFirstName", "memberTitle", "reviewToken"],
  trip: ["userName", "userIcon", "replyToken"],
  traveloka: ["reviewerName"],
  // Expedia: tên khách nằm ở traveler.name/title — gỡ riêng trong normalizeExpedia vì "title"
  // cũng là tiêu đề bài. Hai khoá dưới chỉ là phần trang trí giao diện, bỏ cho JSON gốc gọn.
  expedia: ["analytics", "icon"],
};

/** Giới hạn một ô Google Sheet là 50.000 ký tự; chừa lề. */
const RAW_MAX = 45000;

/** Tên hạng mục gốc của Booking (đúng chữ trên extranet tiếng Việt). */
const BOOKING_CATEGORIES = [
  ["hotelStaff", "Nhân viên"],
  ["hotelClean", "Sự sạch sẽ"],
  ["hotelLocation", "Vị trí"],
  ["hotelServices", "Tiện nghi"],
  ["hotelComfort", "Sự thoải mái"],
  ["hotelValue", "Sự đáng giá tiền"],
];

/** Hạng mục phụ của Booking đến dưới dạng khoá dịch; cắt tiền tố, đặt nhãn cho mục đã đo. */
const BOOKING_EXTRA_PREFIX = "ugcc_extranet_guest_reviews_additional_";
const BOOKING_EXTRA_LABELS = { bed: "Giường", room_view: "Tầm nhìn từ phòng", wifi: "Wifi" };

export function stripPersonal(channel, value) {
  const drop = new Set(STRIP_FIELDS[channel] ?? []);
  return JSON.parse(
    JSON.stringify(value, (k, v) => (drop.has(k) ? undefined : v)),
  );
}

function rawJson(channel, value) {
  const text = JSON.stringify(stripPersonal(channel, value));
  return text.length > RAW_MAX ? text.slice(0, RAW_MAX) + "…[cắt]" : text;
}

/** Điểm Booking có bản "7,5" (định dạng) và bản số; ưu tiên bản định dạng vì nó đúng thang 10 hiển thị. */
function bookingScore(review, field) {
  const formatted = review[`${field}Formatted`];
  if (typeof formatted === "string" && formatted.trim() !== "") {
    const n = Number(formatted.replace(",", "."));
    if (Number.isFinite(n)) return n;
  }
  const n = review[field];
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

/** "/Date(1791227994000+0800)/" → ISO UTC. */
export function parseMsDate(value) {
  if (typeof value !== "string") return "";
  const m = value.match(/\/Date\((-?\d+)/);
  return m ? new Date(Number(m[1])).toISOString() : value;
}

/** "2026-09-19 13:21:04" → "2026-09-19T13:21:04" (Booking không ghi múi giờ; giữ nguyên giờ). */
function bookingDate(value) {
  return typeof value === "string" ? value.replace(" ", "T") : "";
}

function text(value) {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "object") return "";
  return String(value);
}

/** FNV-1a 32 bit — đủ để biết nội dung bài có đổi giữa hai lượt quét. */
export function contentHash(parts) {
  let h = 0x811c9dc5;
  const s = JSON.stringify(parts);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function finish(row) {
  row.hash = contentHash([
    row.score,
    row.title,
    row.positive,
    row.negative,
    row.comment,
    row.reply,
  ]);
  return row;
}

function baseRow(channel, hotel, channelHotelId, reviewId) {
  return {
    key: `${channel}|${reviewId}`,
    channel,
    hotel,
    channelHotelId: String(channelHotelId ?? ""),
    reviewId: String(reviewId),
    bookingCode: "",
    reviewDate: "",
    checkIn: "",
    checkOut: "",
    roomType: "",
    guestType: "",
    country: "",
    language: "",
    score: null,
    scale: 10,
    title: "",
    positive: "",
    negative: "",
    comment: "",
    reply: "",
    replyDate: "",
    hash: "",
    raw: "",
  };
}

export function normalizeBooking(review, { hotel, channelHotelId }) {
  const row = baseRow("booking", hotel, channelHotelId ?? review.hotelId, review.id);
  row.bookingCode = text(review.booknumber);
  row.reviewDate = bookingDate(review.completed);
  row.country = text(review.cc1);
  row.language = text(review.language);
  row.score = bookingScore(review, "hotelAverage");
  row.title = text(review.title);
  row.positive = text(review.hotelPositive);
  row.negative = text(review.hotelNegative);
  // reply là "" khi chưa trả lời, là {hotelierResponse, created, approved} khi đã trả lời (đo 07/10/2026).
  const reply = review.reply;
  if (reply && typeof reply === "object") {
    row.reply = text(reply.hotelierResponse);
    row.replyDate = row.reply ? bookingDate(reply.created) : "";
  } else {
    row.reply = text(reply);
  }
  row.raw = rawJson("booking", review);

  const scores = [];
  for (const [field, name] of BOOKING_CATEGORIES) {
    const s = bookingScore(review, field);
    if (s != null) scores.push(scoreRow(row, field, name, s, 10));
  }
  for (const extra of review.additionalRatings ?? []) {
    const s = Number(String(extra.scoreOutOf10Formatted ?? extra.scoreOutOf10).replace(",", "."));
    if (extra.name && Number.isFinite(s)) {
      const code = String(extra.name).replace(BOOKING_EXTRA_PREFIX, "");
      scores.push(scoreRow(row, `extra:${code}`, BOOKING_EXTRA_LABELS[code] ?? code, s, 10));
    }
  }
  return { review: finish(row), scores };
}

export function normalizeAgoda(item, { hotel, channelHotelId }) {
  const info = item.reviewInfo ?? {};
  const fb = item.reviewFeedback ?? {};
  const row = baseRow("agoda", hotel, channelHotelId ?? info.hotelId, info.reviewId);
  row.bookingCode = text(info.bookingId);
  row.reviewDate = text(info.reviewDate);
  row.checkIn = text(info.checkInDate);
  row.checkOut = text(info.checkOutDate);
  row.roomType = text(info.hotelRoomType);
  row.guestType = text(info.demographicName);
  row.country = text(info.countryISO2);
  row.language = text(info.language);
  row.score = typeof info.score === "number" ? info.score : null;
  row.title = text(info.title);
  row.positive = text(info.positive);
  row.negative = text(info.negative);
  row.comment = text(info.comment);
  row.reply = text(fb.feedbackComment);
  row.replyDate = row.reply ? text(fb.feedbackDate) : "";
  row.raw = rawJson("agoda", item);
  // Agoda không trả điểm hạng mục cho từng bài (reviewScores = null, đo 07/10/2026).
  return { review: finish(row), scores: [] };
}

export function normalizeTrip(item, { hotel, channelHotelId }) {
  const row = baseRow("trip", hotel, channelHotelId, item.commentId);
  const score = item.score ?? {};
  row.reviewDate = parseMsDate(item.addtime);
  row.checkIn = text(item.checkinTimeStr);
  row.roomType = text(item.hotelRoomInfo);
  row.language = text(item.sourceName);
  row.score = typeof score.avgScore === "number" ? score.avgScore : item.avgScore ?? null;
  row.scale = typeof score.maxScore === "number" ? score.maxScore : 10;
  row.comment = text(item.content);
  row.reply = text(item.replyDetail?.replyContent);
  row.replyDate = row.reply ? parseMsDate(item.replyDetail?.replyTime) : "";
  row.raw = rawJson("trip", item);

  const scores = (score.subScores ?? [])
    .filter((s) => s && s.name && typeof s.score === "number")
    .map((s) => scoreRow(row, s.type ?? s.name, s.name, s.score, row.scale));
  return { review: finish(row), scores };
}

/** Mili giây (chuỗi hoặc số) → ISO UTC. */
function msToIso(value) {
  const n = Number(value);
  return value !== null && value !== "" && Number.isFinite(n) ? new Date(n).toISOString() : "";
}

/**
 * Ngày nhận/trả phòng Traveloka là mili giây của nửa đêm giờ địa phương; quy về ngày theo
 * giờ Việt Nam (UTC+7) để không lùi một ngày. Giả định: khách sạn ở Việt Nam.
 */
function msToVnDate(value) {
  const n = Number(value);
  if (value === null || value === "" || !Number.isFinite(n)) return "";
  return new Date(n + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

export function normalizeTraveloka(item, { hotel, channelHotelId }) {
  const row = baseRow("traveloka", hotel, channelHotelId, item.reviewId);
  const booking = item.bookingInfo ?? {};
  const reply = item.businessReplyDataDisplay;
  row.bookingCode = text(item.bookingId);
  row.reviewDate = msToIso(item.timestamp);
  row.checkIn = msToVnDate(booking.checkInDate);
  row.checkOut = msToVnDate(booking.checkOutDate);
  row.roomType = text(booking.roomTypeDisplayText);
  row.guestType = text(item.travelThemeDisplayText);
  row.language = text(item.language);
  const score = Number(item.overallScore);
  row.score = item.overallScore != null && Number.isFinite(score) ? score : null;
  row.comment = text(item.reviewText);
  if (reply && typeof reply === "object") {
    row.reply = text(reply.replyText);
    row.replyDate = row.reply ? msToIso(reply.timestamp) : "";
  }
  row.raw = rawJson("traveloka", item);
  // Traveloka chỉ có điểm hạng mục cấp khách sạn (aggregateInfo), lấy ở bảng Điểm tổng hợp.
  return { review: finish(row), scores: [] };
}

const EN_MONTHS = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
const pad2 = (n) => String(n).padStart(2, "0");

/** "Posted Aug 20, 2026" → "2026-08-20". Chữ tiếng Anh vì hàm quét ép locale en_US. */
export function parseEnDate(value) {
  const m = String(value ?? "").match(/\b([A-Z][a-z]{2})[a-z]*\.? (\d{1,2}), (\d{4})/);
  if (!m || !EN_MONTHS[m[1]]) return "";
  return `${m[3]}-${pad2(EN_MONTHS[m[1]])}-${pad2(m[2])}`;
}

/** "Fri, Jul 24 – Thu, Jul 30, 2026" → ["2026-07-24", "2026-07-30"]; đầu kỳ thiếu năm thì mượn năm cuối kỳ. */
export function parseEnStay(value) {
  const parts = [...String(value ?? "").matchAll(/\b([A-Z][a-z]{2}) (\d{1,2})(?:, (\d{4}))?/g)]
    .filter((m) => EN_MONTHS[m[1]])
    .map((m) => ({ month: EN_MONTHS[m[1]], day: Number(m[2]), year: m[3] ? Number(m[3]) : null }));
  if (parts.length < 2) return ["", ""];
  const [a, b] = parts;
  const endYear = b.year ?? a.year;
  if (!endYear) return ["", ""];
  const startYear = a.year ?? (a.month > b.month ? endYear - 1 : endYear);
  return [`${startYear}-${pad2(a.month)}-${pad2(a.day)}`, `${endYear}-${pad2(b.month)}-${pad2(b.day)}`];
}

/** Gom mọi chuỗi "text" trong một khối giao diện (Expedia trả nội dung dưới dạng khối hiển thị). */
function collectText(node) {
  if (node == null) return [];
  if (typeof node === "string") return [];
  if (Array.isArray(node)) return node.flatMap(collectText);
  if (typeof node === "object") {
    const own = typeof node.text === "string" ? [node.text] : [];
    return own.concat(Object.entries(node).filter(([k]) => k !== "text").flatMap(([, v]) => collectText(v)));
  }
  return [];
}

/** Câu Expedia hiện thay cho nhận xét khi khách không viết gì. */
const EXPEDIA_NO_COMMENT = /^This guest didn't leave a comment\.?$/i;

export function normalizeExpedia(item, { hotel, channelHotelId }) {
  const row = baseRow("expedia", hotel, channelHotelId, item.reviewCardIdentifier);
  const traveler = item.traveler ?? {};
  row.bookingCode = text(item.bookingIdentifier?.orderRefNumber);
  row.reviewDate = parseEnDate(item.postedDate?.text);
  [row.checkIn, row.checkOut] = parseEnStay(traveler.details?.[0]?.text);
  const rating = String(item.rating?.[0]?.text ?? "").match(/([\d.,]+)\s*\/\s*(\d+)/);
  if (rating) {
    row.score = Number(rating[1].replace(",", "."));
    row.scale = Number(rating[2]);
  }
  row.title = text(item.title);
  row.comment = (item.content?.content ?? [])
    .map((c) => text(c?.text))
    .filter((t) => t && !EXPEDIA_NO_COMMENT.test(t))
    .join("\n");
  // Dạng của "response" chưa đo được (đo 08/10/2026: 0 bài có phản hồi) ⇒ gom mọi chữ bên trong.
  if (item.response) row.reply = collectText(item.response).join("\n").trim();
  const clean = { ...item, traveler: { ...traveler, name: undefined, title: undefined, avatar: undefined } };
  row.raw = rawJson("expedia", clean);
  return { review: finish(row), scores: [] };
}

function scoreRow(review, code, name, score, scale) {
  return {
    key: `${review.key}|${code}`,
    reviewKey: review.key,
    channel: review.channel,
    hotel: review.hotel,
    category: name,
    categoryCode: code,
    score,
    scale,
  };
}

const NORMALIZERS = {
  booking: normalizeBooking,
  agoda: normalizeAgoda,
  trip: normalizeTrip,
  traveloka: normalizeTraveloka,
  expedia: normalizeExpedia,
};

/** Chuẩn hoá cả lô của một kênh. Bài lỗi không làm hỏng cả lô: được đếm và báo lại. */
export function normalizeBatch(channel, items, ctx) {
  const fn = NORMALIZERS[channel];
  if (!fn) throw new Error(`Kênh lạ: ${channel}`);
  const reviews = [];
  const scores = [];
  const errors = [];
  for (const item of items) {
    try {
      const out = fn(item, ctx);
      reviews.push(out.review);
      scores.push(...out.scores);
    } catch (e) {
      errors.push(String(e?.message ?? e));
    }
  }
  return { reviews, scores, errors };
}
