// Nạp Code.gs vào một ngữ cảnh vm để thử các hàm thuần, không cần Google.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { CHANNELS } from "../extension/config.js";

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

// ---------- Máy cài và nhật ký lỗi ----------
const { normalizeName, mergeDevice, cleanLogs } = ctx;
const dev = (over = {}) => ({ deviceId: "aaaaaaaa-1111", hotel: "Linh Đan", version: "0.3.0", channels: "booking", intervalHours: 6, ...over });
const T0 = "2026-10-08T00:00:00.000Z";
const hoursLater = (h) => new Date(Date.parse(T0) + h * 3600000).toISOString();

test("Tên chuẩn hoá: bỏ dấu, đ, khoảng trắng thừa, hoa thường", () => {
  assert.equal(normalizeName("  Linh   Đan "), "linh dan");
  assert.equal(normalizeName("LINH DAN"), normalizeName("Linh Đan"));
  assert.notEqual(normalizeName("Linh Đan"), normalizeName("Secret Garden"));
});

test("Máy mới ⇒ một dòng; hạn liên lạc = 2 × chu kỳ; trạng thái kênh thành chữ", () => {
  const rows = plain(mergeDevice([], dev({ status: { booking: { state: "login" }, trip: { state: "ok" } } }), { action: "Thử Sheet" }, T0));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].nameKey, "linh dan");
  assert.equal(rows[0].firstSeen, T0);
  assert.equal(rows[0].deadline, hoursLater(12));
  assert.equal(rows[0].statusText, "Booking: cần đăng nhập · Trip: ổn");
  assert.equal(rows[0].warning, "");
});

test("Cùng máy liên lạc lại ⇒ vẫn một dòng, giữ lần đầu, lỗi gần nhất được ghi", () => {
  let rows = mergeDevice([], dev(), { action: "a" }, T0);
  rows = plain(mergeDevice(rows, dev({ hotel: "linh dan" }), { action: "b", error: "Trip · quét · hỏng" }, hoursLater(1)));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].firstSeen, T0);
  assert.equal(rows[0].lastSeen, hoursLater(1));
  assert.equal(rows[0].lastError, "Trip · quét · hỏng");
  assert.equal(rows[0].warning, "");
});

test("Hai máy khác nhau cùng khai một tên ⇒ cảnh báo trùng", () => {
  let rows = mergeDevice([], dev(), { action: "a" }, T0);
  rows = plain(mergeDevice(rows, dev({ deviceId: "bbbbbbbb-2222", hotel: "LINH DAN" }), { action: "a" }, hoursLater(1)));
  assert.equal(rows.length, 1);
  assert.match(rows[0].warning, /Trùng tên: 2 máy/);
});

test("Cài lại extension (mã mới) ⇒ hết cảnh báo khi mã cũ im quá cửa sổ", () => {
  let rows = mergeDevice([], dev(), { action: "a" }, T0);
  rows = plain(mergeDevice(rows, dev({ deviceId: "cccccccc-3333" }), { action: "a" }, hoursLater(13)));
  assert.equal(rows[0].warning, "");
});

test("Máy đổi tên ⇒ dòng mới, dòng cũ ghi rõ đã đổi tên và bỏ mã máy", () => {
  let rows = mergeDevice([], dev(), { action: "a" }, T0);
  rows = plain(mergeDevice(rows, dev({ hotel: "Linh Đan Phan Xích Long" }), { action: "a" }, hoursLater(1)));
  assert.equal(rows.length, 2);
  const old = rows.find((r) => r.nameKey === "linh dan");
  assert.match(old.warning, /đã đổi tên sang “Linh Đan Phan Xích Long”/);
  assert.equal(old.devices, "");
});

test("Nhật ký lỗi: gắn máy, bỏ query khỏi URL, cắt độ dài, tối đa 50 dòng", () => {
  const logs = Array.from({ length: 60 }, (_, i) => ({
    at: T0, channel: "booking", stage: "quét", message: "x".repeat(900), url: "https://admin.booking.com/a?ses=BIMAT", detail: String(i),
  }));
  const out = plain(cleanLogs(logs, dev(), T0));
  assert.equal(out.length, 50);
  assert.equal(out[49].detail, "59", "giữ các dòng mới nhất");
  assert.equal(out[0].hotel, "Linh Đan");
  assert.equal(out[0].device, "aaaaaaaa");
  assert.equal(out[0].url, "https://admin.booking.com/a");
  assert.ok(out[0].message.length <= 501);
  assert.deepEqual(plain(cleanLogs(undefined, dev(), T0)), []);
});

// ---------- Mã lỗi ----------
const { lastErrorText, migrateColumns, columnLetter, lostFormula, pickSeparator } = ctx;

test("Nhật ký lỗi giữ mã lỗi đúng dạng; mã lạ (có thể là công thức chèn vào) bị bỏ", () => {
  const ok = plain(cleanLogs([{ ref: "E-7K3QX2", code: "BKG-LOGIN", stage: "đăng nhập" }], dev(), T0))[0];
  assert.equal(ok.ref, "E-7K3QX2");
  assert.equal(ok.code, "BKG-LOGIN");
  const g2j = plain(cleanLogs([{ ref: "E-7K3QX2", code: "G2J-LOGIN", stage: "đăng nhập" }], dev(), T0))[0];
  assert.equal(g2j.code, "G2J-LOGIN", "tiền tố kênh có chữ số (Go2Joy) vẫn được nhận");
  const bad = plain(cleanLogs([{ ref: "=HYPERLINK(1)", code: "bkg login; drop" }], dev(), T0))[0];
  assert.equal(bad.ref, "");
  assert.equal(bad.code, "");
  assert.equal(SHEETS.logs.columns[0][1], "Mã lỗi", "mã lỗi ở cột đầu để Ctrl+F thấy ngay");
});

test("Ô lỗi gần nhất của Máy cài bắt đầu bằng mã lỗi", () => {
  assert.equal(
    lastErrorText({ ref: "E-7K3QX2", code: "TRP-HTTP", channel: "trip", stage: "quét", message: "Trip HTTP 500" }),
    "E-7K3QX2 · TRP-HTTP · Trip · quét · Trip HTTP 500",
  );
  assert.equal(lastErrorText({ ref: "", code: "", channel: "", stage: "gửi Sheet", message: "hỏng" }), "gửi Sheet · hỏng");
  assert.equal(lastErrorText(null), "");
});

const spec = [["ref", "Mã lỗi"], ["code", "Loại lỗi"], ["at", "Thời điểm"], ["msg", "Lỗi"]];

test("Nâng cấp tab cũ: dữ liệu dời theo TÊN cột, cột mới để trống", () => {
  const m = plain(migrateColumns(["Thời điểm", "Lỗi"], [["T1", "hỏng"], ["T2", "hỏng 2"]], spec));
  assert.deepEqual(m.header, ["Mã lỗi", "Loại lỗi", "Thời điểm", "Lỗi"]);
  assert.deepEqual(m.rows, [["", "", "T1", "hỏng"], ["", "", "T2", "hỏng 2"]]);
});

test("Tiêu đề đã đúng, hoặc chỉ có thêm cột người dùng ở cuối ⇒ không đụng tới", () => {
  assert.equal(migrateColumns(["Mã lỗi", "Loại lỗi", "Thời điểm", "Lỗi"], [], spec), null);
  assert.equal(migrateColumns(["Mã lỗi", "Loại lỗi", "Thời điểm", "Lỗi", "Ghi chú của tôi"], [], spec), null);
  assert.equal(migrateColumns(["Mã lỗi", "Loại lỗi", "Thời điểm", "Lỗi", "", ""], [], spec), null);
});

test("Nâng cấp không bao giờ bỏ cột: cột lạ, cột trùng tên, cột không tên mà có dữ liệu đều được giữ", () => {
  const m = plain(migrateColumns(["Lỗi", "Ghi chú", "Lỗi", ""], [["a", "b", "c", "d"]], spec));
  assert.deepEqual(m.header, ["Mã lỗi", "Loại lỗi", "Thời điểm", "Lỗi", "Ghi chú", "Lỗi", "(cột cũ 4)"]);
  assert.deepEqual(m.rows, [["", "", "", "a", "b", "c", "d"]]);
});

test("Tiêu đề không trùng tên nào ⇒ không xếp lại (tránh xoá trắng dữ liệu)", () => {
  assert.equal(migrateColumns(["", ""], [["x", "y"]], spec), null);
  assert.equal(migrateColumns(["A", "B"], [["x", "y"]], spec), null);
});

test("Công thức Mất liên lạc dùng địa chỉ A1 (R1C1 bị Sheets ghi nguyên chữ ⇒ #ERROR!)", () => {
  assert.equal(columnLetter(1), "A");
  assert.equal(columnLetter(15), "O");
  assert.equal(columnLetter(27), "AA");
  const deadlineCol = SHEETS.devices.columns.findIndex((c) => c[0] === "deadline") + 1;
  assert.equal(columnLetter(deadlineCol), "O");
  assert.equal(lostFormula("O2"), '=IF(O2="","",IF(NOW()>O2,"MẤT LIÊN LẠC",""))');
  assert.doesNotMatch(lostFormula("O2"), /RC\[/);
});

test("Công thức Mất liên lạc viết được bằng cả hai dấu phân cách", () => {
  assert.equal(lostFormula("O2", ";"), '=IF(O2="";"";IF(NOW()>O2;"MẤT LIÊN LẠC";""))');
  assert.doesNotMatch(lostFormula("O2", ";"), /,/);
});

// Giả lập Sheet: chỉ phân tích được công thức viết bằng dấu `accepts`.
function fakeSheet(accepts) {
  const writes = [];
  let last = null;
  return {
    writes,
    write: (s) => { writes.push(s); last = s; },
    broken: () => last !== accepts,
  };
}

test("Sheet vùng Việt Nam: dấu \",\" hỏng ⇒ tự đổi sang \";\" và trả dấu đó để nhớ", () => {
  const sh = fakeSheet(";");
  assert.equal(pickSeparator(null, sh.write, sh.broken), ";");
  assert.deepEqual(sh.writes, [",", ";"]);
});

test("Đã nhớ \";\" ⇒ lượt sau ghi thẳng một lần", () => {
  const sh = fakeSheet(";");
  assert.equal(pickSeparator(";", sh.write, sh.broken), ";");
  assert.deepEqual(sh.writes, [";"]);
});

test("Sheet vùng Mỹ: dấu \",\" chạy ngay, không thử dấu kia", () => {
  const sh = fakeSheet(",");
  assert.equal(pickSeparator(null, sh.write, sh.broken), ",");
  assert.deepEqual(sh.writes, [","]);
});

test("Cả hai dấu đều hỏng ⇒ trả rỗng, không lặp vô tận", () => {
  const sh = fakeSheet("không dấu nào");
  assert.equal(pickSeparator(null, sh.write, sh.broken), "");
  assert.equal(sh.writes.length, 2);
});

test("Code.gs và extension biết cùng một bộ kênh", () => {
  assert.deepEqual(Object.keys(ctx.CHANNEL_NAMES).sort(), [...CHANNELS].sort());
});
