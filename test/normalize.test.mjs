// Dữ liệu giả lập theo dạng trường đo được ngày 07/10/2026 — không dùng review thật.
import { test } from "node:test";
import assert from "node:assert/strict";
import { contentHash, normalizeBatch, parseMsDate, stripPersonal } from "../extension/normalize.js";

const ctx = { hotel: "KS Thử", channelHotelId: "111" };

const booking = {
  id: 9001,
  hotelId: 111,
  name: "Nguyễn Văn A",
  yourname: "A",
  booknumber: 5550001,
  completed: "2026-09-19 13:21:04",
  cc1: "vn",
  language: "vi",
  hotelAverage: 7.5,
  hotelAverageFormatted: "7,5",
  title: "Tốt",
  hotelPositive: "Sạch",
  hotelNegative: "Ồn",
  reply: { hotelierResponse: "Cảm ơn bạn", created: "2026-09-20 08:00:00", approved: 1 },
  hotelStaff: 8,
  hotelStaffFormatted: "8",
  hotelClean: 7.5,
  hotelCleanFormatted: "7,5",
  additionalRatings: [{ name: "ugcc_extranet_guest_reviews_additional_wifi", score: 5, scoreOutOf10: 10 }],
};

const agoda = {
  reviewer: "B",
  memberFirstName: "B",
  reviewToken: "tok",
  reviewInfo: {
    reviewId: 7001, hotelId: 222, bookingId: 8001, reviewDate: "2026-09-01T00:00:00",
    checkInDate: "2026-08-28", checkOutDate: "2026-08-30", hotelRoomType: "Deluxe",
    demographicName: "Cặp đôi", countryISO2: "KR", language: "ko", score: 9.2,
    title: "Hay", positive: "Gần chợ", negative: "", comment: "Ổn",
  },
  reviewFeedback: { feedbackComment: "Cảm ơn", feedbackDate: "2026-09-02" },
};

const trip = {
  commentId: 3001,
  userName: "C",
  userIcon: "x.png",
  replyToken: "r",
  addtime: "/Date(1791227994000+0800)/",
  checkinTimeStr: "2026-09",
  hotelRoomInfo: "Standard",
  sourceName: "English",
  content: "Nice",
  score: { avgScore: 9, maxScore: 10, subScores: [{ type: "clean", name: "Cleanliness", score: 9 }] },
  replyDetail: { replyContent: "Thanks", replyTime: "/Date(1791300000000+0800)/" },
};

test("Booking: điểm định dạng có dấu phẩy, ngày, hạng mục, gỡ tên khách", () => {
  const { reviews, scores, errors } = normalizeBatch("booking", [booking], ctx);
  assert.equal(errors.length, 0);
  const r = reviews[0];
  assert.equal(r.key, "booking|9001");
  assert.equal(r.score, 7.5);
  assert.equal(r.reviewDate, "2026-09-19T13:21:04");
  assert.equal(r.bookingCode, "5550001");
  assert.ok(!r.raw.includes("Nguyễn Văn A"), "tên khách phải bị gỡ khỏi JSON gốc");
  assert.equal(r.reply, "Cảm ơn bạn", "reply của Booking là object");
  assert.equal(r.replyDate, "2026-09-20T08:00:00");
  assert.deepEqual(
    scores.map((s) => [s.categoryCode, s.category, s.score]),
    [["hotelStaff", "Nhân viên", 8], ["hotelClean", "Sự sạch sẽ", 7.5], ["extra:wifi", "Wifi", 10]],
  );
  assert.equal(scores[0].key, "booking|9001|hotelStaff");
});

test("Agoda: trường lồng, phản hồi, không có điểm hạng mục từng bài", () => {
  const { reviews, scores } = normalizeBatch("agoda", [agoda], ctx);
  const r = reviews[0];
  assert.equal(r.key, "agoda|7001");
  assert.equal(r.country, "KR");
  assert.equal(r.reply, "Cảm ơn");
  assert.equal(r.replyDate, "2026-09-02");
  assert.equal(scores.length, 0);
  for (const f of ["reviewer", "memberFirstName", "reviewToken"]) assert.ok(!r.raw.includes(`"${f}"`), f);
});

test("Trip: ngày /Date()/, thang 10, điểm hạng mục, gỡ tên khách", () => {
  const { reviews, scores } = normalizeBatch("trip", [trip], ctx);
  const r = reviews[0];
  assert.equal(r.key, "trip|3001");
  assert.equal(r.reviewDate, new Date(1791227994000).toISOString());
  assert.equal(r.scale, 10);
  assert.equal(r.score, 9);
  assert.equal(r.reply, "Thanks");
  assert.deepEqual(scores.map((s) => s.key), ["trip|3001|clean"]);
  assert.ok(!r.raw.includes('"userName"'));
});

test("Bài lỗi không làm hỏng cả lô", () => {
  const { reviews, errors } = normalizeBatch("agoda", [null, agoda], ctx);
  assert.equal(reviews.length, 1);
  assert.equal(errors.length, 1);
});

test("Booking chưa trả lời: reply là chuỗi rỗng", () => {
  const r = normalizeBatch("booking", [{ ...booking, reply: "" }], ctx).reviews[0];
  assert.equal(r.reply, "");
  assert.equal(r.replyDate, "");
});

test("Mã nội dung đổi khi phản hồi đổi, đứng yên khi không", () => {
  const a = normalizeBatch("booking", [booking], ctx).reviews[0].hash;
  const same = normalizeBatch("booking", [{ ...booking }], ctx).reviews[0].hash;
  const replied = normalizeBatch("booking", [{ ...booking, reply: "" }], ctx).reviews[0].hash;
  assert.equal(a, same);
  assert.notEqual(a, replied);
  assert.match(contentHash(["x"]), /^[0-9a-f]{8}$/);
});

test("Tiện ích nhỏ", () => {
  assert.equal(parseMsDate("abc"), "abc");
  assert.equal(parseMsDate(undefined), "");
  assert.deepEqual(stripPersonal("trip", { a: { userName: "x", b: 1 } }), { a: { b: 1 } });
  assert.throws(() => normalizeBatch("hotels-com", [], ctx));
});

// ---------- Traveloka và Expedia (dạng trường đo ngày 08/10/2026) ----------
import { parseEnDate, parseEnStay } from "../extension/normalize.js";

const traveloka = {
  reviewId: "1000004253",
  bookingId: "1300001",
  reviewerName: "Nguyễn Thị D",
  timestamp: "1788000000000",
  language: "VIETNAMESE",
  overallScore: "8.5",
  reviewText: "Phòng sạch",
  travelThemeDisplayText: "businessTripText",
  bookingInfo: { checkInDate: "1787590800000", checkOutDate: "1787763600000", roomTypeDisplayText: null },
  businessReplyDataDisplay: null,
  photoDataDisplayList: [],
};

test("Traveloka: điểm dạng chuỗi, ngày mili giây, ngày ở theo giờ Việt Nam, gỡ tên khách", () => {
  const { reviews, scores } = normalizeBatch("traveloka", [traveloka], { hotel: "KS", channelHotelId: "20103318" });
  const r = reviews[0];
  assert.equal(r.key, "traveloka|1000004253");
  assert.equal(r.score, 8.5);
  assert.equal(r.reviewDate, new Date(1788000000000).toISOString());
  // 1787590800000 = 00:00 giờ VN ngày 25/08/2026 = 17:00 UTC ngày 24 ⇒ phải ra ngày 25.
  assert.equal(r.checkIn, "2026-08-25");
  assert.equal(r.bookingCode, "1300001");
  assert.equal(r.reply, "");
  assert.equal(scores.length, 0);
  assert.ok(!r.raw.includes("Nguyễn Thị D"));
});

test("Traveloka: bài chỉ chấm điểm và bài đã phản hồi", () => {
  const onlyScore = normalizeBatch("traveloka", [{ ...traveloka, reviewText: "" }], {}).reviews[0];
  assert.equal(onlyScore.comment, "");
  assert.equal(onlyScore.score, 8.5);
  const replied = normalizeBatch("traveloka", [{ ...traveloka, businessReplyDataDisplay: { replyText: "Cảm ơn", timestamp: "1788100000000" } }], {}).reviews[0];
  assert.equal(replied.reply, "Cảm ơn");
  assert.equal(replied.replyDate, new Date(1788100000000).toISOString());
});

const expedia = {
  reviewCardIdentifier: "abcdefabcdefabcdefabcdef",
  bookingIdentifier: { orderRefNumber: "9100000000001", reservationUuid: null },
  postedDate: { text: "Posted Aug 20, 2026" },
  rating: [{ text: "8/10" }],
  title: "",
  content: { content: [{ text: "This guest didn't leave a comment." }] },
  response: null,
  traveler: {
    name: "Isaac Thử",
    title: "Isaac",
    details: [{ icon: { id: "x" }, text: "Fri, Jul 24 – Thu, Jul 30, 2026" }, { icon: { id: "y" }, text: "Expedia" }],
  },
  actions: [{ analytics: { event: "e" }, primary: "Respond" }],
};

test("Expedia: chữ điểm, chữ ngày, câu 'không bình luận', gỡ tên khách", () => {
  const r = normalizeBatch("expedia", [expedia], { hotel: "KS", channelHotelId: "126951449" }).reviews[0];
  assert.equal(r.key, "expedia|abcdefabcdefabcdefabcdef");
  assert.equal(r.score, 8);
  assert.equal(r.scale, 10);
  assert.equal(r.reviewDate, "2026-08-20");
  assert.equal(r.checkIn, "2026-07-24");
  assert.equal(r.checkOut, "2026-07-30");
  assert.equal(r.bookingCode, "9100000000001");
  assert.equal(r.comment, "", "câu thay thế không được tính là nhận xét");
  assert.ok(!r.raw.includes("Isaac"), "tên khách phải bị gỡ");
  assert.ok(!r.raw.includes('"analytics"'));
});

test("Expedia: nhận xét thật và phản hồi được gom chữ", () => {
  const r = normalizeBatch("expedia", [{
    ...expedia,
    content: { content: [{ text: "Great stay" }, { text: "Friendly staff" }] },
    response: { header: { text: "Your response" }, body: [{ text: "Thank you!" }] },
  }], {}).reviews[0];
  assert.equal(r.comment, "Great stay\nFriendly staff");
  assert.equal(r.reply, "Your response\nThank you!");
});

test("Expedia: kỳ lưu trú vắt qua năm", () => {
  assert.deepEqual(parseEnStay("Wed, Dec 30 – Sat, Jan 2, 2027"), ["2026-12-30", "2027-01-02"]);
  assert.deepEqual(parseEnStay("Wed, Dec 30, 2026 – Sat, Jan 2, 2027"), ["2026-12-30", "2027-01-02"]);
  assert.deepEqual(parseEnStay("không có ngày"), ["", ""]);
  assert.equal(parseEnDate("Posted Jun 2, 2026"), "2026-06-02");
  assert.equal(parseEnDate("Đăng ngày 2/6"), "");
});
