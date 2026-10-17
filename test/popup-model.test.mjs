import { test } from "node:test";
import assert from "node:assert/strict";
import { reviewRow } from "../extension/popup-model.js";

const CH = ["booking", "agoda"];
const cfg = { hotel: "UB1", sheetUrl: "https://s", secret: "x", intervalHours: 6, enabled: { booking: true, agoda: true } };

test("reviewRow: chưa cài đặt xong · chưa bật kênh · chưa quét", () => {
  assert.equal(reviewRow({ ...cfg, secret: "" }, {}, CH).state, "Chưa cài đặt xong");
  assert.equal(reviewRow({ ...cfg, enabled: {} }, {}, CH).state, "Chưa bật kênh nào");
  assert.match(reviewRow(cfg, {}, CH).state, /Chưa quét lần nào · 2 kênh/);
});

test("reviewRow: kênh cần đăng nhập là vàng, kênh lỗi là đỏ", () => {
  const login = reviewRow(cfg, { booking: { state: "login", at: "2026-10-16T01:00:00Z" }, agoda: { state: "ok", count: 3, at: "2026-10-16T01:00:00Z" } }, CH);
  assert.equal(login.tone, "warn");
  assert.match(login.state, /1 kênh cần đăng nhập lại/);
  const err = reviewRow(cfg, { booking: { state: "error" }, agoda: { state: "login" } }, CH);
  assert.equal(err.tone, "err");
  assert.equal(err.state, "2 kênh lỗi");
});

test("reviewRow: chạy ổn cộng số bài; kênh đã tắt không tính", () => {
  const r = reviewRow({ ...cfg, enabled: { booking: true } }, { booking: { state: "ok", count: 4, at: "2026-10-16T01:00:00Z" }, agoda: { state: "error" } }, CH);
  assert.equal(r.tone, "ok");
  assert.equal(r.state, "Đang chạy · 1 kênh");
  assert.match(r.detail, /4 bài · tự quét mỗi 6 giờ/);
});
