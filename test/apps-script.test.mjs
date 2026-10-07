// Nạp Code.gs vào một ngữ cảnh vm để thử các hàm thuần, không cần Google.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const ctx = {};
vm.createContext(ctx);
vm.runInContext(readFileSync(new URL("../apps-script/Code.gs", import.meta.url), "utf8"), ctx);
const { mergeRows, sanitizeCell, SHEETS } = ctx;

const columns = [
  ["key", "Khoá", "text"],
  ["hotel", "Khách sạn", "text"],
  ["score", "Điểm", "number"],
  ["reply", "Phản hồi", "text"],
  ["firstSeen", "Lần đầu thấy", "text"],
  ["lastSeen", "Lần cuối thấy", "text"],
];

test("Bài mới được thêm, đóng dấu lần đầu và lần cuối thấy", () => {
  const r = mergeRows(columns, "key", [], [{ key: "booking|1", hotel: "A", score: 8, reply: null }], "T1");
  assert.equal(r.inserted, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(r.rows)), [["booking|1", "A", 8, "", "T1", "T1"]]);
});

test("Bài trùng không đổi nội dung: không đếm là đổi, chỉ dời lần cuối thấy", () => {
  const existing = [["booking|1", "A", 8, "", "T1", "T1"]];
  const r = mergeRows(columns, "key", existing, [{ key: "booking|1", hotel: "A", score: 8, reply: "" }], "T2");
  assert.equal(r.inserted, 0);
  assert.equal(r.updated, 0);
  assert.equal(r.rows[0][4], "T1", "lần đầu thấy giữ nguyên");
  assert.equal(r.rows[0][5], "T2");
});

test("Khách sạn trả lời ⇒ đếm là đổi và ghi đè ô", () => {
  const existing = [["booking|1", "A", 8, "", "T1", "T1"]];
  const r = mergeRows(columns, "key", existing, [{ key: "booking|1", hotel: "A", score: 8, reply: "Cảm ơn" }], "T2");
  assert.equal(r.updated, 1);
  assert.equal(r.rows[0][3], "Cảm ơn");
});

test("Dòng của khách sạn khác không bị đụng", () => {
  const existing = [["agoda|9", "B", 9, "", "T0", "T0"]];
  const r = mergeRows(columns, "key", existing, [{ key: "booking|1", hotel: "A", score: 8 }], "T2");
  assert.equal(r.rows.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(r.rows[0])), ["agoda|9", "B", 9, "", "T0", "T0"]);
});

test("Số đọc lại từ Sheet so bằng chữ với số mới", () => {
  const existing = [["trip|5", "A", 9, "", "T1", "T1"]];
  const r = mergeRows(columns, "key", existing, [{ key: "trip|5", hotel: "A", score: 9.0 }], "T2");
  assert.equal(r.updated, 0);
});

test("Ô bắt đầu bằng ký tự công thức bị vô hiệu", () => {
  assert.equal(sanitizeCell("=HYPERLINK(\"x\")"), "'=HYPERLINK(\"x\")");
  assert.equal(sanitizeCell("-ồn ào"), "'-ồn ào");
  assert.equal(sanitizeCell("bình thường"), "bình thường");
  assert.equal(sanitizeCell(7.5), 7.5);
  assert.equal(sanitizeCell(null), "");
});

test("Cột của tab Review khớp đủ khoá extension gửi lên", async () => {
  const { normalizeBatch } = await import("../extension/normalize.js");
  const { reviews, scores } = normalizeBatch("trip", [{ commentId: 1, score: { avgScore: 9, subScores: [{ type: "c", name: "C", score: 9 }] } }], { hotel: "A", channelHotelId: "1" });
  const reviewCols = SHEETS.review.columns.map((c) => c[0]);
  for (const k of Object.keys(reviews[0])) assert.ok(reviewCols.includes(k), `thiếu cột ${k} ở tab Review`);
  const scoreCols = SHEETS.scores.columns.map((c) => c[0]);
  for (const k of Object.keys(scores[0])) assert.ok(scoreCols.includes(k), `thiếu cột ${k} ở tab Điểm hạng mục`);
});

// ---------- Trang Thống kê ----------
const { buildStats } = ctx;
const NOW = "2026-10-07T00:00:00.000Z";
const rv = (o) => {
  const channel = o.channel ?? "booking";
  return { key: `${channel}|${o.id}`, hotel: "A", channel, scale: 10, reply: "", ...o };
};
const plain = (x) => JSON.parse(JSON.stringify(x));

test("Thống kê theo khách sạn: điểm TB, 30 ngày, chênh lệch, tỷ lệ phản hồi", () => {
  const reviews = [
    rv({ id: 1, score: 8, reviewDate: "2026-10-01T10:00:00", reply: "Cảm ơn" }),
    rv({ id: 2, score: 6, reviewDate: "2026-09-20T10:00:00" }),
    rv({ id: 3, score: 9, reviewDate: "2026-08-20T10:00:00", reply: "Cảm ơn" }),
    rv({ id: 4, score: 5, reviewDate: "2026-01-01T10:00:00" }),
  ];
  const [byHotel] = plain(buildStats(reviews, [], [], [], NOW));
  assert.deepEqual(byHotel.rows[0], ["A", 4, 7, 2, 7, 9, -2, "50%", 2]);
  assert.equal(byHotel.rows.at(-1)[0], "TOÀN CHUỖI");
});

test("Thống kê quy điểm khác thang về thang 10", () => {
  const reviews = [rv({ id: 1, channel: "x", score: 4, scale: 5, reviewDate: "2026-10-01" })];
  const [byHotel] = plain(buildStats(reviews, [], [], [], NOW));
  assert.equal(byHotel.rows[0][2], 8);
});

test("Thống kê theo kênh: lấy lượt quét MỚI NHẤT và điểm kênh công bố mới nhất", () => {
  const reviews = [rv({ id: 1, channel: "agoda", score: 8, reviewDate: "2026-10-01" })];
  const runs = [
    { at: "2026-10-06T01:00:00Z", hotel: "A", channel: "agoda", status: "lỗi", note: "x" },
    { at: "2026-10-06T07:00:00Z", hotel: "A", channel: "agoda", status: "ok", note: "" },
    { at: "2026-10-06T07:00:00Z", hotel: "A", channel: "trip", status: "cần đăng nhập", note: "Cần đăng nhập lại" },
  ];
  const snaps = [
    { at: "2026-10-05T00:00:00Z", hotel: "A", channel: "agoda", categoryCode: "overall", score: 7, scale: 10 },
    { at: "2026-10-06T00:00:00Z", hotel: "A", channel: "agoda", categoryCode: "overall", score: 8.4, scale: 10 },
  ];
  const [, byPair] = plain(buildStats(reviews, runs, [], snaps, NOW));
  const agoda = byPair.rows.find((r) => r[1] === "agoda");
  assert.deepEqual(agoda.slice(-3), [8.4, "2026-10-06 07:00 UTC", "ok"]);
  const trip = byPair.rows.find((r) => r[1] === "trip");
  assert.ok(trip, "kênh chỉ có lượt quét lỗi vẫn phải hiện để thấy nó đang im");
  assert.equal(trip[2], 0);
  assert.equal(trip.at(-1), "cần đăng nhập — Cần đăng nhập lại");
});

test("Điểm hạng mục chỉ lấy bài trong cửa sổ 90 ngày", () => {
  const reviews = [
    rv({ id: 1, score: 8, reviewDate: "2026-10-01" }),
    rv({ id: 2, score: 8, reviewDate: "2026-01-01" }),
  ];
  const scores = [
    { key: "booking|1|c", reviewKey: "booking|1", hotel: "A", channel: "booking", category: "Sạch", score: 9, scale: 10 },
    { key: "booking|2|c", reviewKey: "booking|2", hotel: "A", channel: "booking", category: "Sạch", score: 1, scale: 10 },
  ];
  const [, , cats] = plain(buildStats(reviews, [], scores, [], NOW));
  assert.deepEqual(cats.rows, [["A", "booking", "Sạch", 1, 9]]);
});

test("Sheet rỗng không làm hỏng thống kê", () => {
  const blocks = plain(buildStats([], [], [], [], NOW));
  assert.equal(blocks.length, 3);
  assert.ok(blocks.every((b) => b.rows.length === 0));
});
