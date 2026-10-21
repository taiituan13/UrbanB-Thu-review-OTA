// YC-158 (H-1539 lối 2): trạng thái thu review của máy — dòng Thu review trên khung PMS và tin ext:status.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { helpHTML, reviewBlockHTML, reviewProblemCount } from "../extension/quay/review-ui.js";
import { todoModel } from "../extension/quay/todo.js";
import { failedWhenText, hhmm, hubChannels, reviewStatusModel, reviewSummaryText } from "../extension/quay/review-status.js";

const help = { what: "Máy không mở được trang Agoda.", why: "Mạng chập chờn.", steps: ["Kiểm tra mạng.", "Bấm Quét review ngay."] };
const base = { order: ["booking", "agoda", "trip"], enabled: { booking: true, agoda: true, trip: false }, labels: { booking: "Booking", agoda: "Agoda" }, missing: null };
const NOW = new Date("2026-10-21T08:00:00Z");

test("🔴 kênh lỗi ⇒ bad, đếm đúng, mang mã và lời hướng dẫn; kênh tắt không tính", () => {
  const m = reviewStatusModel({
    ...base,
    status: {
      booking: { at: "2026-10-21T07:00:00Z", state: "ok", count: 4 },
      agoda: { at: "2026-10-21T07:05:00Z", okAt: "2026-10-20T07:00:00Z", state: "error", error: { code: "AGD-OPEN", ref: "E-ABC234", help } },
      trip: { at: "2026-10-21T07:06:00Z", state: "error", error: { code: "TRP-HTTP" } },
    },
  });
  assert.equal(m.state, "bad");
  assert.equal(m.bad, 1);
  assert.deepEqual(m.rows.map((r) => r.key), ["booking", "agoda"]);
  assert.deepEqual(m.rows[1], { key: "agoda", label: "Agoda", state: "error", at: "2026-10-21T07:05:00Z", okAt: "2026-10-20T07:00:00Z", count: null, code: "AGD-OPEN", ref: "E-ABC234", help });
  // Giờ quét ỔN gần nhất, không phải giờ lượt lỗi.
  assert.equal(m.lastOkAt, "2026-10-21T07:00:00.000Z");
  assert.equal(reviewSummaryText(m, NOW), "Thu review đang lỗi ở 1 kênh.");
});

test("🔴 quét ổn mà gửi Hub hỏng ⇒ vẫn là lỗi, lời hướng dẫn của lỗi gửi Hub", () => {
  const hubHelp = { what: "Review chưa lên Hub.", why: "Chưa đăng nhập Hub.", steps: ["Đăng nhập Hub."] };
  const m = reviewStatusModel({ ...base, status: { booking: { at: "2026-10-21T07:00:00Z", state: "ok", hub: { ok: false, error: { code: "HUB-LOGIN", ref: "E-H", help: hubHelp } } } } });
  assert.equal(m.rows[0].state, "error");
  assert.equal(m.rows[0].code, "HUB-LOGIN");
  assert.equal(m.rows[0].okAt, null);
  assert.equal(m.state, "bad");
});

test("cần đăng nhập lại kênh ⇒ login, tính là lỗi với lễ tân", () => {
  const m = reviewStatusModel({ ...base, status: { agoda: { at: "x", state: "login", error: { code: "AGD-LOGIN", help } } } });
  assert.equal(m.rows[1].state, "login");
  assert.equal(m.bad, 1);
});

test("thiếu cấu hình thắng mọi thứ; không bật kênh nào ⇒ none; chưa quét ⇒ never; ổn ⇒ ok kèm giờ", () => {
  assert.equal(reviewStatusModel({ ...base, status: {}, missing: help }).state, "missing");
  assert.equal(reviewStatusModel({ ...base, enabled: {}, status: {} }).state, "none");
  const never = reviewStatusModel({ ...base, status: {} });
  assert.equal(never.state, "never");
  assert.equal(never.rows[0].state, null);
  const ok = reviewStatusModel({ ...base, status: { booking: { at: "2026-10-21T07:00:00Z", state: "ok" } } });
  assert.equal(ok.state, "ok");
  assert.equal(reviewSummaryText(ok, NOW), "Thu review chạy bình thường, quét được lần cuối lúc 14:00.");
});

test("giờ khác ngày thì kèm ngày; lỗi chưa từng quét được nói rõ", () => {
  assert.equal(hhmm("2026-10-20T07:00:00Z", NOW), "14:00 ngày 20/10");
  assert.equal(failedWhenText({ at: "2026-10-21T07:05:00Z", okAt: null }, NOW), "Lỗi lúc 14:05, chưa quét được lần nào.");
  assert.equal(failedWhenText({ at: "2026-10-21T07:05:00Z", okAt: "2026-10-21T01:00:00Z" }, NOW), "Lỗi lúc 14:05, quét được lần cuối lúc 08:00.");
});

test("🔴 tin cho Hub: đủ trường hợp đồng, không mang thứ khác của trạng thái kênh", () => {
  const m = reviewStatusModel({ ...base, status: { agoda: { at: "a", state: "error", message: "lộ chi tiết", error: { code: "AGD-OPEN", ref: "E-1", help, message: "x", stage: "quét" } } } });
  const [, agoda] = hubChannels(m);
  assert.deepEqual(Object.keys(agoda), ["channel", "state", "at", "okAt", "count", "code", "ref", "what", "why", "steps"]);
  assert.deepEqual(agoda.steps, help.steps);
  assert.ok(!JSON.stringify(hubChannels(m)).includes("lộ chi tiết"));
});

test("khung chỉ nhập tệp trong quay/: review-status.js không nhập gì", () => {
  const src = readFileSync(new URL("../extension/quay/review-status.js", import.meta.url), "utf8");
  assert.doesNotMatch(src, /^import /m);
});

// ---------- Khối Thu review trên khung PMS (quay/review-ui.js) ----------

const badModel = () =>
  reviewStatusModel({
    ...base,
    status: { agoda: { at: "2026-10-21T07:05:00Z", state: "error", error: { code: "AGD-OPEN", ref: "E-ABC234", help } } },
  });

test("🔴 khung: kênh lỗi hiện chuyện gì, vì sao, các bước có số, mã lỗi và nút Sao chép", () => {
  const html = reviewBlockHTML(badModel(), { now: NOW });
  assert.match(html, /Agoda/);
  assert.match(html, /Đang lỗi/);
  assert.match(html, /Máy không mở được trang Agoda\./);
  assert.match(html, /Vì sao:<\/span> Mạng chập chờn\./);
  assert.match(html, /<ol><li>Kiểm tra mạng\.<\/li><li>Bấm Quét review ngay\.<\/li><\/ol>/);
  assert.match(html, /<code>E-ABC234<\/code><button[^>]*data-act="reviewCopy"[^>]*>Sao chép</);
  assert.match(html, /data-act="reviewScan"[^>]*>Quét review ngay</);
  assert.match(html, /Lỗi lúc 14:05, chưa quét được lần nào\./);
});

test("🔴 khung: kênh lỗi cộng vào số của tab Cần xử lý; thiếu cấu hình tính 1; ổn tính 0", () => {
  assert.equal(reviewProblemCount(badModel()), 1);
  assert.equal(reviewProblemCount(reviewStatusModel({ ...base, status: {}, missing: help })), 1);
  assert.equal(reviewProblemCount(reviewStatusModel({ ...base, status: { booking: { at: "x", state: "ok" } } })), 0);
  assert.equal(reviewProblemCount(null), 0);
  const t = todoModel({ recent: { matches: [] }, ind: null, review: 2 });
  assert.equal(t.count, 2);
  assert.equal(t.review, 2);
});

test("khung: thiếu cấu hình ⇒ lời hướng dẫn ba phần, không có nút quét; ổn ⇒ một dòng kèm nút", () => {
  const miss = reviewBlockHTML(reviewStatusModel({ ...base, status: {}, missing: help }), { now: NOW });
  assert.match(miss, /<ol>/);
  assert.doesNotMatch(miss, /reviewScan/);
  const ok = reviewBlockHTML(reviewStatusModel({ ...base, status: { booking: { at: "2026-10-21T07:00:00Z", state: "ok" } } }), { now: NOW });
  assert.match(ok, /chạy bình thường/);
  assert.match(ok, /Quét review ngay/);
  assert.match(reviewBlockHTML(null), /Đang tải/);
});

test("khung: chữ từ bộ nhớ được thoát HTML", () => {
  assert.match(helpHTML({ what: "<b>x</b>", why: "", steps: ["<i>"] }), /&lt;b&gt;x&lt;\/b&gt;.*&lt;i&gt;/s);
});
